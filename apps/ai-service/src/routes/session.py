"""Session routes for real-time training pipeline."""
from __future__ import annotations

import asyncio
import json
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
import httpx
import structlog

from livekit.api import AccessToken, VideoGrants
from livekit import rtc

from src.config import settings
from src.core.orchestrator import SessionOrchestrator

logger = structlog.get_logger(__name__)
router = APIRouter()

# Active session orchestrators
active_sessions: dict[str, SessionOrchestrator] = {}
# Active LiveKit rooms
active_rooms: dict[str, rtc.Room] = {}


class StartSessionRequest(BaseModel):
    session_id: str
    tenant_id: str
    scenario_id: str = ""
    scenario_config: dict
    persona_config: dict
    avatar_provider: str = "simli"
    livekit_room: str = ""


class EndSessionRequest(BaseModel):
    session_id: str


def _create_bot_token(room_name: str, session_id: str) -> str:
    """Create a LiveKit access token for the AI bot participant."""
    token = AccessToken(
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
    )
    token.identity = f"bot-{session_id}"
    token.name = "AI Avatar"
    token.metadata = json.dumps({"role": "bot", "session_id": session_id})
    token.add_grant(VideoGrants(
        room=room_name,
        room_join=True,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
    ))
    return token.to_jwt()


async def _run_bot_in_room(session_id: str, room_name: str, orchestrator: SessionOrchestrator):
    """Join the LiveKit room as a bot, receive audio, send data events."""
    livekit_url = settings.livekit_url
    bot_token = _create_bot_token(room_name, session_id)

    room = rtc.Room()
    active_rooms[session_id] = room

    # Set up the data event callback: send JSON via data channel to all participants
    async def send_data_event(event_type: str, data: dict):
        """Send session event to learner via LiveKit data channel."""
        try:
            payload = json.dumps({
                "type": event_type,
                "text": data.get("content", ""),
                "message": data.get("violation", ""),
                **{k: v for k, v in data.items() if k not in ("content", "violation")},
            }).encode("utf-8")
            await room.local_participant.publish_data(payload, reliable=True)
        except Exception as e:
            logger.error("data_event_send_failed", error=str(e), event_type=event_type)

    # Assign the callback to orchestrator
    orchestrator.on_data_event = send_data_event

    # Handle incoming audio tracks from learner
    @room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            logger.info("learner_audio_subscribed", participant=participant.identity)
            audio_stream = rtc.AudioStream(track)

            async def process_audio_frames():
                async for frame_event in audio_stream:
                    if hasattr(frame_event, 'frame'):
                        # Convert frame to bytes and send to STT
                        frame = frame_event.frame
                        audio_bytes = frame.data.tobytes()
                        await orchestrator.process_audio(audio_bytes)

            asyncio.ensure_future(process_audio_frames())

    @room.on("participant_disconnected")
    def on_participant_left(participant: rtc.RemoteParticipant):
        logger.info("participant_left", identity=participant.identity)
        # If learner leaves, end the session
        if not participant.identity.startswith("bot-"):
            asyncio.ensure_future(orchestrator.end())

    # Connect to the room
    try:
        await room.connect(livekit_url, bot_token)
        logger.info("bot_joined_room", room=room_name, session_id=session_id)

        # Start the orchestrator (STT, avatar prewarm, opening message)
        await orchestrator.start()

        # Keep the bot alive until the session ends
        while orchestrator._active:
            await asyncio.sleep(1)

    except Exception as e:
        logger.error("bot_room_connection_failed", error=str(e), room=room_name)
    finally:
        await room.disconnect()
        active_rooms.pop(session_id, None)
        logger.info("bot_left_room", room=room_name, session_id=session_id)


@router.post("/start")
async def start_session(req: StartSessionRequest, background_tasks: BackgroundTasks):
    """Start a new training session - spawns the orchestrator and bot."""
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

    if req.livekit_room:
        # Join the LiveKit room as a bot and process audio in real-time
        background_tasks.add_task(_run_bot_in_room, req.session_id, req.livekit_room, orchestrator)
    else:
        # Fallback: start orchestrator without LiveKit (no audio processing)
        background_tasks.add_task(orchestrator.start)

    logger.info("session_start_requested", session_id=req.session_id, room=req.livekit_room)
    return {"message": "Session starting", "session_id": req.session_id}


@router.post("/end")
async def end_session(req: EndSessionRequest, background_tasks: BackgroundTasks):
    """End a training session and trigger scoring."""
    orchestrator = active_sessions.pop(req.session_id, None)

    if orchestrator:
        await orchestrator.end()

    # Disconnect bot from room
    room = active_rooms.pop(req.session_id, None)
    if room:
        await room.disconnect()

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
