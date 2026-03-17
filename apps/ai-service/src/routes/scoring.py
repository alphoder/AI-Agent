"""Scoring routes for evaluating completed training sessions."""

from __future__ import annotations

from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from src.config import settings
from src.core.scoring import ScoringEngine

logger = structlog.get_logger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RubricLevel(BaseModel):
    score: int
    description: str


class RubricCriterion(BaseModel):
    name: str
    description: str
    weight: float
    levels: list[RubricLevel] = []


class EvaluateRequest(BaseModel):
    session_id: str
    rubric: list[RubricCriterion]
    persona_context: str
    scenario_objective: str
    tenant_id: str
    assignment_id: Optional[str] = None
    lineitem_url: Optional[str] = None


class CriterionScore(BaseModel):
    criterion_name: str
    score: int
    weight: float
    justification: str


class EvaluateResponse(BaseModel):
    session_id: str
    overall_score: float
    criteria_scores: list[CriterionScore]
    strengths: list[str]
    improvements: list[str]
    narrative_feedback: str
    scored_by_model: str


# ---------------------------------------------------------------------------
# Background helpers
# ---------------------------------------------------------------------------

async def _passback_grade(
    api_gateway_url: str,
    session_id: str,
    lineitem_url: str,
    score: float,
    tenant_id: str,
) -> None:
    """Fire-and-forget LTI grade passback via the API gateway."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                f"{api_gateway_url}/api/lti/passback",
                json={
                    "session_id": session_id,
                    "lineitem_url": lineitem_url,
                    "score": score,
                    "tenant_id": tenant_id,
                },
            )
        logger.info("lti_passback_sent", session_id=session_id)
    except Exception as exc:
        logger.error(
            "lti_passback_failed",
            session_id=session_id,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_session(
    body: EvaluateRequest,
    background_tasks: BackgroundTasks,
):
    """Evaluate a completed session and generate scores."""
    api_gateway_url = settings.api_gateway_url
    session_id = body.session_id

    logger.info("evaluate_session_start", session_id=session_id)

    # ------------------------------------------------------------------
    # 1. Fetch the transcript from the API gateway
    # ------------------------------------------------------------------
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            transcript_resp = await client.get(
                f"{api_gateway_url}/api/sessions/{session_id}/transcript",
            )
            transcript_resp.raise_for_status()
            resp_body = transcript_resp.json()
            transcript: list[dict] = resp_body.get("data", resp_body)
    except httpx.HTTPStatusError as exc:
        logger.error(
            "transcript_fetch_failed",
            session_id=session_id,
            status=exc.response.status_code,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch transcript for session {session_id}",
        ) from exc
    except Exception as exc:
        logger.error(
            "transcript_fetch_error",
            session_id=session_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach API gateway for transcript: {exc}",
        ) from exc

    # ------------------------------------------------------------------
    # 2. Run the scoring engine
    # ------------------------------------------------------------------
    engine = ScoringEngine(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
    )

    rubric_dicts = [c.model_dump() for c in body.rubric]

    try:
        result = await engine.evaluate(
            transcript=transcript,
            rubric=rubric_dicts,
            persona_context=body.persona_context,
            scenario_objective=body.scenario_objective,
        )
    except RuntimeError as exc:
        logger.error(
            "scoring_engine_failed",
            session_id=session_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Scoring engine failed: {exc}",
        ) from exc

    # ------------------------------------------------------------------
    # 3. Persist the score via the API gateway
    # ------------------------------------------------------------------
    score_payload = {
        "session_id": session_id,
        "tenant_id": body.tenant_id,
        "assignment_id": body.assignment_id,
        "overall_score": result["overall_score"],
        "criteria_scores": result["criteria_scores"],
        "strengths": result["strengths"],
        "improvements": result["improvements"],
        "narrative_feedback": result["narrative_feedback"],
        "scored_by_model": result["scored_by_model"],
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            save_resp = await client.post(
                f"{api_gateway_url}/api/sessions/{session_id}/score",
                json=score_payload,
            )
            save_resp.raise_for_status()
        logger.info("score_saved", session_id=session_id)
    except Exception as exc:
        # Log but don't fail the request — the caller still gets the result
        logger.error(
            "score_save_failed",
            session_id=session_id,
            error=str(exc),
        )

    # ------------------------------------------------------------------
    # 4. Trigger LTI grade passback (fire-and-forget)
    # ------------------------------------------------------------------
    if body.lineitem_url:
        background_tasks.add_task(
            _passback_grade,
            api_gateway_url,
            session_id,
            body.lineitem_url,
            result["overall_score"],
            body.tenant_id,
        )

    # ------------------------------------------------------------------
    # 5. Return the scoring result
    # ------------------------------------------------------------------
    return EvaluateResponse(
        session_id=session_id,
        overall_score=result["overall_score"],
        criteria_scores=result["criteria_scores"],
        strengths=result["strengths"],
        improvements=result["improvements"],
        narrative_feedback=result["narrative_feedback"],
        scored_by_model=result["scored_by_model"],
    )
