"""Session routes for real-time training pipeline."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
import httpx
import structlog

from src.config import settings
from src.core.orchestrator import SessionOrchestrator

logger = structlog.get_logger(__name__)
router = APIRouter()

# Active session orchestrators
active_sessions: dict[str, SessionOrchestrator] = {}


class StartSessionRequest(BaseModel):
    session_id: str
    tenant_id: str
    scenario_id: str
    scenario_config: dict
    persona_config: dict
    avatar_provider: str = "simli"


class EndSessionRequest(BaseModel):
    session_id: str


@router.post("/start")
async def start_session(req: StartSessionRequest, background_tasks: BackgroundTasks):
    """Start a new training session - spawns the orchestrator."""
    if req.session_id in active_sessions:
        return {"message": "Session already active", "session_id": req.session_id}

    orchestrator = SessionOrchestrator(
        session_id=req.session_id,
        tenant_id=req.tenant_id,
        scenario_config=req.scenario_config,
        persona_config=req.persona_config,
        avatar_provider=req.avatar_provider,
    )

    active_sessions[req.session_id] = orchestrator
    background_tasks.add_task(orchestrator.start)

    logger.info("session_start_requested", session_id=req.session_id)
    return {"message": "Session starting", "session_id": req.session_id}


@router.post("/end")
async def end_session(req: EndSessionRequest, background_tasks: BackgroundTasks):
    """End a training session and trigger scoring."""
    orchestrator = active_sessions.pop(req.session_id, None)

    if orchestrator:
        await orchestrator.end()

    # Trigger scoring
    background_tasks.add_task(_trigger_scoring, req.session_id)

    return {"message": "Session ended", "session_id": req.session_id}


async def _trigger_scoring(session_id: str):
    """Trigger post-session scoring."""
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"http://localhost:8000/scoring/evaluate",
                json={"session_id": session_id},
                timeout=60.0,
            )
    except Exception as e:
        logger.error("scoring_trigger_failed", session_id=session_id, error=str(e))


@router.post("/process")
async def process_audio(session_id: str):
    """Process audio chunk from learner (placeholder for WebSocket upgrade)."""
    orchestrator = active_sessions.get(session_id)
    if not orchestrator:
        return {"error": "Session not found"}
    return {"message": "Audio processing via LiveKit data channel"}
