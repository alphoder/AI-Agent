"""WebSocket relay for a live voice session backed by Gemini Live.

Security model:
  * The browser may only connect with a short-lived signed ticket (issued by the
    API gateway, bound to {session_id, user_id}). No valid ticket → no socket.
  * One live socket per session — a second connection for the same session is
    rejected (prevents hijack / mid-session disturbance).
  * Origin is checked, messages are size- and rate-capped, malformed frames are
    ignored, and sessions are hard-capped in duration.

Pipeline: browser mic PCM16 → Gemini Live (STT + LLM + native voice out) →
audio + transcripts back. Webcam frames → Gemini Flash → short body-language
notes (frame discarded). Notes + transcripts persisted to the API.
"""
from __future__ import annotations

import asyncio
import json
import time

import httpx
import structlog
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.config import settings
from src.core.body_language import analyze_frame
from src.core.ws_ticket import verify_ticket

logger = structlog.get_logger(__name__)
router = APIRouter()

# Gemini Live native-audio prebuilt voices.
_LIVE_VOICES = {"Puck", "Charon", "Kore", "Fenrir", "Aoede"}
_DEFAULT_VOICE = "Aoede"

_MIN_FRAME_INTERVAL_SEC = 6.0          # ignore body-language frames faster than this
_MAX_MESSAGE_BYTES = 2_000_000         # ~2 MB cap per inbound message
_MAX_MESSAGES_PER_SEC = 60             # flood guard
_MAX_SESSION_SECONDS = 1800            # hard 30-min cap

# One live socket per session id (hijack / double-connect guard).
_ACTIVE_SESSIONS: set[str] = set()


def _internal_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.api_gateway_url,
        headers={"Content-Type": "application/json", "X-Internal-Key": settings.internal_api_key},
        timeout=10.0,
    )


def _origin_allowed(origin: str | None) -> bool:
    # Browsers always send Origin; if present it must be allow-listed. (The ticket
    # is the primary auth; this is defence-in-depth against CSWSH.)
    if not origin:
        return True
    return origin in settings.cors_origins


@router.websocket("/ws/session")
async def session_ws(websocket: WebSocket):
    # ---- Authenticate BEFORE accepting the socket ----
    ticket = verify_ticket(websocket.query_params.get("ticket", ""))
    if not ticket:
        await websocket.close(code=1008)  # policy violation
        return
    if not _origin_allowed(websocket.headers.get("origin")):
        await websocket.close(code=1008)
        return

    session_id = str(ticket["sid"])
    user_id = str(ticket["uid"])

    if session_id in _ACTIVE_SESSIONS:
        # Another live socket already owns this session — refuse.
        await websocket.close(code=1008)
        return
    _ACTIVE_SESSIONS.add(session_id)

    await websocket.accept()

    raw_lang = websocket.query_params.get("lang", "en")
    lang = "".join(c for c in raw_lang if c.isalpha() or c == "-").lower()[:8] or "en"
    started = time.monotonic()
    logger.info("session.connected", session_id=session_id, user_id=user_id, lang=lang)

    mic_active = True
    gemini_ws = None
    receiver_task = None
    api = _internal_client()

    rate = {"window": 0.0, "count": 0}
    state = {
        "system_prompt": "You are a friendly conversation partner. Keep replies to 1-2 sentences.",
        "voice": _DEFAULT_VOICE,
        "user_transcript": "",
        "assistant_transcript": "",
        "user_final_sent": False,
        "turn": 0,
        "last_frame_at": 0.0,
        "frame_in_flight": False,
    }

    async def persist_turn(learner: str, coach: str):
        if not (learner or coach):
            return
        state["turn"] += 1
        try:
            await api.post(
                "/api/internal/transcripts",
                json={
                    "session_id": session_id,
                    "turn_number": state["turn"],
                    "learner_content": learner or None,
                    "coach_content": coach or None,
                },
            )
        except Exception as err:  # noqa: BLE001
            logger.warning("session.persist_turn_failed", error=str(err))

    async def handle_frame(jpeg_b64: str):
        try:
            note = await analyze_frame(jpeg_b64)
            if note:
                at = round(time.monotonic() - started, 1)
                await api.post(
                    f"/api/internal/sessions/{session_id}/body-language",
                    json={"at": at, "note": note},
                )
        except Exception as err:  # noqa: BLE001
            logger.warning("session.frame_failed", error=str(err))
        finally:
            state["frame_in_flight"] = False

    async def gemini_receiver():
        try:
            async for raw in gemini_ws:
                data = json.loads(raw)
                # Gemini sends "setupComplete": {} (an empty dict → falsy), so we
                # must check for presence, not truthiness.
                if "setupComplete" in data:
                    await websocket.send_json({"type": "listening"})
                    continue
                sc = data.get("serverContent")
                if not sc:
                    continue
                if sc.get("interrupted"):
                    await websocket.send_json({"type": "interrupted"})
                    continue
                inp = sc.get("inputTranscription")
                if inp and inp.get("text"):
                    state["user_transcript"] += inp["text"]
                    await websocket.send_json({"type": "transcript_interim", "text": state["user_transcript"]})
                out = sc.get("outputTranscription")
                if out and out.get("text"):
                    state["assistant_transcript"] += out["text"]
                model_turn = sc.get("modelTurn")
                if model_turn:
                    # Emit the learner transcript ONCE per turn — modelTurn frames
                    # arrive repeatedly as audio streams, so guard with a flag.
                    if state["user_transcript"] and not state["user_final_sent"]:
                        await websocket.send_json({"type": "transcript", "text": state["user_transcript"], "role": "user"})
                        state["user_final_sent"] = True
                    for part in model_turn.get("parts", []):
                        inline = part.get("inlineData") or part.get("inline_data")
                        if inline and inline.get("data"):
                            await websocket.send_json({"type": "audio_out", "data": inline["data"]})
                if sc.get("turnComplete"):
                    learner = state["user_transcript"].strip()
                    coach = state["assistant_transcript"].strip()
                    if coach:
                        await websocket.send_json({"type": "response_text", "text": coach, "role": "assistant"})
                    await persist_turn(learner, coach)
                    state["user_transcript"] = ""
                    state["assistant_transcript"] = ""
                    state["user_final_sent"] = False
                    await websocket.send_json({"type": "response_end"})
        except asyncio.CancelledError:
            pass
        except Exception as err:  # noqa: BLE001
            logger.error("session.receiver_error", error=str(err))
            try:
                await websocket.send_json({"type": "error", "message": "stream error"})
            except Exception:
                pass

    try:
        # 1. config message (size-checked)
        first_raw = await websocket.receive_text()
        if len(first_raw.encode("utf-8", "ignore")) > _MAX_MESSAGE_BYTES:
            await websocket.close(code=1009)  # message too big
            return
        first = json.loads(first_raw)
        if first.get("type") == "config":
            if isinstance(first.get("system_prompt"), str):
                state["system_prompt"] = first["system_prompt"][:8000]
            voice = first.get("voice")
            state["voice"] = voice if voice in _LIVE_VOICES else _DEFAULT_VOICE

        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not configured")

        gemini_url = (
            "wss://generativelanguage.googleapis.com/ws/"
            "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
            f"?key={settings.gemini_api_key}"
        )
        gemini_ws = await websockets.connect(gemini_url, max_size=None)

        setup_msg = {
            "setup": {
                "model": settings.gemini_live_model,
                "generation_config": {
                    "response_modalities": ["AUDIO"],
                    "speech_config": {
                        "voice_config": {"prebuilt_voice_config": {"voice_name": state["voice"]}}
                    },
                },
                "system_instruction": {"parts": [{"text": state["system_prompt"]}]},
                "input_audio_transcription": {},
                "output_audio_transcription": {},
            }
        }
        await gemini_ws.send(json.dumps(setup_msg))
        receiver_task = asyncio.create_task(gemini_receiver())

        # 2. client loop (hardened)
        while True:
            if time.monotonic() - started > _MAX_SESSION_SECONDS:
                await websocket.send_json({"type": "error", "message": "session time limit reached"})
                break

            raw = await websocket.receive_text()
            if len(raw.encode("utf-8", "ignore")) > _MAX_MESSAGE_BYTES:
                continue  # drop oversized frames

            # crude per-second flood guard
            now = time.monotonic()
            if now - rate["window"] >= 1.0:
                rate["window"] = now
                rate["count"] = 0
            rate["count"] += 1
            if rate["count"] > _MAX_MESSAGES_PER_SEC:
                continue

            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if not isinstance(msg, dict):
                continue
            mtype = msg.get("type")

            if mtype == "audio":
                if mic_active and gemini_ws and gemini_ws.state.name == "OPEN":
                    data = msg.get("data")
                    if isinstance(data, str) and data:
                        # New Live API audio input format: realtime_input.audio
                        # (the old realtime_input.media_chunks is rejected by
                        # gemini-3.x-live and closes the stream).
                        await gemini_ws.send(json.dumps({
                            "realtime_input": {"audio": {"mime_type": "audio/pcm;rate=16000", "data": data}}
                        }))

            elif mtype == "video_frame":
                data = msg.get("data")
                if (
                    isinstance(data, str) and data
                    and not state["frame_in_flight"]
                    and now - state["last_frame_at"] >= _MIN_FRAME_INTERVAL_SEC
                ):
                    state["last_frame_at"] = now
                    state["frame_in_flight"] = True
                    task = asyncio.create_task(handle_frame(data))
                    task.add_done_callback(lambda t: t.exception())

            elif mtype == "text":
                user_text = (msg.get("text") or "")
                if isinstance(user_text, str):
                    user_text = user_text.strip()[:2000]
                if user_text and gemini_ws and gemini_ws.state.name == "OPEN":
                    await websocket.send_json({"type": "transcript", "text": user_text, "role": "user"})
                    await gemini_ws.send(json.dumps({
                        "client_content": {
                            "turns": [{"role": "user", "parts": [{"text": user_text}]}],
                            "turn_complete": True,
                        }
                    }))

            elif mtype == "mic_off":
                mic_active = False
            elif mtype == "mic_on":
                mic_active = True

    except WebSocketDisconnect:
        logger.info("session.disconnected", session_id=session_id)
    except Exception as err:  # noqa: BLE001
        logger.error("session.error", error=str(err))
        try:
            await websocket.send_json({"type": "error", "message": "session error"})
        except Exception:
            pass
    finally:
        _ACTIVE_SESSIONS.discard(session_id)
        if receiver_task:
            receiver_task.cancel()
        if gemini_ws and gemini_ws.state.name == "OPEN":
            await gemini_ws.close()
        await api.aclose()
