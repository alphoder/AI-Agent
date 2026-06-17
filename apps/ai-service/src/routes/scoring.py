"""Scoring route — evaluate a completed session with Gemini and persist the score."""
from __future__ import annotations

import httpx
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config import settings
from src.core.scoring import ScoringEngine

logger = structlog.get_logger(__name__)
router = APIRouter()

_api_client: httpx.AsyncClient | None = None


def _get_api_client() -> httpx.AsyncClient:
    global _api_client
    if _api_client is None or _api_client.is_closed:
        _api_client = httpx.AsyncClient(
            base_url=settings.api_gateway_url,
            headers={"Content-Type": "application/json", "X-Internal-Key": settings.internal_api_key},
            timeout=60.0,
        )
    return _api_client


class RubricLevel(BaseModel):
    score: int
    label: str | None = None
    description: str


class RubricCriterion(BaseModel):
    name: str
    description: str
    weight: float
    levels: list[RubricLevel] = []


class BodyLanguageNote(BaseModel):
    at: float = 0
    note: str


class EvaluateRequest(BaseModel):
    session_id: str
    rubric: list[RubricCriterion]
    persona_context: str = ""
    scenario_objective: str = ""
    language: str = "en"
    body_language_notes: list[BodyLanguageNote] = []


@router.post("/evaluate")
async def evaluate_session(body: EvaluateRequest):
    session_id = body.session_id
    logger.info("scoring.start", session_id=session_id)

    client = _get_api_client()

    # 1. Fetch transcript
    try:
        resp = await client.get(f"/api/internal/sessions/{session_id}/transcript")
        resp.raise_for_status()
        payload = resp.json()
        transcript: list[dict] = payload.get("data", payload)
    except Exception as exc:  # noqa: BLE001
        logger.error("scoring.transcript_fetch_failed", session_id=session_id, error=str(exc))
        raise HTTPException(status_code=502, detail="Failed to fetch transcript") from exc

    # 2. Evaluate with Gemini
    engine = ScoringEngine()
    try:
        result = await engine.evaluate(
            transcript=transcript,
            rubric=[c.model_dump() for c in body.rubric],
            persona_context=body.persona_context,
            scenario_objective=body.scenario_objective,
            body_language_notes=[n.model_dump() for n in body.body_language_notes],
        )
    except RuntimeError as exc:
        logger.error("scoring.engine_failed", session_id=session_id, error=str(exc))
        raise HTTPException(status_code=502, detail=f"Scoring failed: {exc}") from exc

    # 3. Persist the score
    try:
        save = await client.post(f"/api/internal/sessions/{session_id}/score", json={
            "overall_score": result["overall_score"],
            "criteria_scores": result["criteria_scores"],
            "strengths": result["strengths"],
            "improvements": result["improvements"],
            "narrative_feedback": result["narrative_feedback"],
            "body_language_score": result["body_language_score"],
            "body_language_feedback": result["body_language_feedback"],
            "scored_by_model": result["scored_by_model"],
        })
        save.raise_for_status()
        logger.info("scoring.saved", session_id=session_id, overall=result["overall_score"])
    except Exception as exc:  # noqa: BLE001
        logger.error("scoring.save_failed", session_id=session_id, error=str(exc))

    return {"session_id": session_id, **result}
