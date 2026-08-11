"""WebSocket relay for the site voice assistant — Gemini Live on KEY 2.

This is a separate Live connection from the practice session (which uses key 1).
It supports function calling so the assistant can drive the site: the tool
declarations and their execution live in the browser; the relay just forwards
toolCall → browser and tool_response → Gemini.

Security: ticket-secured like /ws/session (one assistant socket per user).
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
from src.core.meter import CallMeter, report_cost
from src.core.origins import origin_allowed
from src.core.ws_ticket import verify_ticket

logger = structlog.get_logger(__name__)
router = APIRouter()


def _internal_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.api_gateway_url,
        headers={"Content-Type": "application/json", "X-Internal-Key": settings.internal_api_key},
        timeout=10.0,
    )

# Native-audio (gemini-3.x-live) supports a wider voice set. "Leda" is youthful —
# closest to a child-like voice for Bixy.
_LIVE_VOICES = {"Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr", "Autonoe", "Sulafat"}
_DEFAULT_VOICE = "Leda"
_MAX_MESSAGE_BYTES = 2_000_000
_MAX_MESSAGES_PER_SEC = 60
_MAX_SECONDS = 1800

# Newest connection per user wins — close the previous socket instead of
# rejecting the new one (rejecting deadlocks the auto-reconnect loop).
_ACTIVE: dict[str, WebSocket] = {}

# Server-side tools the relay answers itself (never forwarded to the browser):
# recall_memory reads Bixy's 24-hour conversation memory from the API gateway,
# go_sleep tells the browser to mute Bixy for a while when the user asks to be
# left alone.
_SERVER_TOOLS = [
    {
        "function_declarations": [
            {
                "name": "recall_memory",
                "description": (
                    "Recall what you and the user talked about earlier today (up to 24 hours back). "
                    "Use this whenever the user refers to an earlier conversation, asks 'do you "
                    "remember…', or asks you to remember something from before. Returns short "
                    "conversation snippets from your short-term memory."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "query": {
                            "type": "STRING",
                            "description": "optional topic or keywords to search for, e.g. 'cold call', 'nerves', 'interview'",
                        }
                    },
                },
            },
            {
                "name": "go_sleep",
                "description": (
                    "Go quiet / stop talking for a while. Call this when the user asks you to be "
                    "quiet, stay silent, stop talking, go to sleep, or take a nap — e.g. 'stay quiet "
                    "for 10 minutes', \"don't talk for 2 hours\", 'go to sleep'. The site mutes the "
                    "mic and hides you until the time is up."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "minutes": {
                            "type": "NUMBER",
                            "description": "how many minutes to stay quiet. Omit (defaults to 30) if the user just says 'go to sleep' without a time.",
                        }
                    },
                },
            },
        ]
    }
]


@router.websocket("/ws/assistant")
async def assistant_ws(websocket: WebSocket):
    ticket = verify_ticket(websocket.query_params.get("ticket", ""))
    if not ticket or not origin_allowed(websocket.headers.get("origin")):
        await websocket.close(code=1008)
        return

    sid = str(ticket["sid"])
    uid = str(ticket.get("uid") or "")
    # Supersede any previous socket for this user (handles reconnects/reloads).
    old = _ACTIVE.get(sid)
    if old is not None:
        try:
            await old.close(code=1000)
        except Exception:
            pass
    await websocket.accept()
    _ACTIVE[sid] = websocket
    started = time.monotonic()
    logger.info("assistant.connected", sid=sid)

    if not settings.gemini_prompt_api_key:
        await websocket.send_json({"type": "error", "message": "assistant is not configured"})
        _ACTIVE.pop(sid, None)
        return

    mic_active = True
    gemini_ws = None
    receiver_task = None
    api = _internal_client()
    meter = CallMeter()
    rate = {"window": 0.0, "count": 0}
    state = {
        "system_prompt": "You are a helpful voice assistant for this website.",
        "voice": _DEFAULT_VOICE,
        "tools": [],
        "assistant_transcript": "",
        "user_transcript": "",
        "user_final_sent": False,
    }

    async def recall_memory(query: str | None) -> list[dict]:
        """Fetch the user's 24-hour conversation memory (newest-first → chronological)."""
        if not uid:
            return []
        try:
            params: dict[str, str | int] = {"user_id": uid, "limit": 40}
            if query:
                params["q"] = query[:120]
            r = await api.get("/api/internal/assistant/memory", params=params)
            if r.status_code != 200:
                return []
            data = r.json().get("data") or []
            return list(reversed(data))
        except Exception as err:  # noqa: BLE001
            logger.warning("assistant.recall_failed", error=str(err))
            return []

    async def remember(learner: str, coach: str):
        """Append a finished turn to the user's 24-hour memory on the API gateway."""
        if not uid:
            return
        entries = []
        if learner:
            entries.append({"role": "user", "text": learner})
        if coach:
            entries.append({"role": "assistant", "text": coach})
        if not entries:
            return
        try:
            await api.post("/api/internal/assistant/memory", json={"user_id": uid, "entries": entries})
        except Exception as err:  # noqa: BLE001
            logger.warning("assistant.remember_failed", error=str(err))

    async def receiver():
        try:
            async for raw in gemini_ws:
                data = json.loads(raw)
                meter.note_usage(data.get("usageMetadata"))
                if "setupComplete" in data:
                    await websocket.send_json({"type": "listening"})
                    continue

                # Function calls: recall_memory and go_sleep are answered here;
                # everything else is forwarded to the browser to execute.
                tool_call = data.get("toolCall")
                if tool_call and tool_call.get("functionCalls"):
                    server_responses = []
                    browser_calls = []
                    for call in tool_call["functionCalls"]:
                        name = call.get("name")
                        args = call.get("args") or {}
                        if name == "recall_memory":
                            snippets = await recall_memory(args.get("query"))
                            server_responses.append({"id": call.get("id"), "name": name, "response": {"snippets": snippets}})
                        elif name == "go_sleep":
                            raw = args.get("minutes")
                            try:
                                minutes = int(raw)
                            except Exception:
                                minutes = None
                            if not minutes or minutes < 1:
                                minutes = 30
                            minutes = min(minutes, 720)
                            await websocket.send_json({"type": "sleep", "minutes": minutes})
                            server_responses.append({"id": call.get("id"), "name": name, "response": {"ok": True, "minutes": minutes}})
                        else:
                            browser_calls.append(call)
                    if server_responses and gemini_ws and gemini_ws.state.name == "OPEN":
                        await gemini_ws.send(json.dumps({"tool_response": {"function_responses": server_responses}}))
                    if browser_calls:
                        await websocket.send_json({"type": "tool_call", "calls": browser_calls})
                    continue

                sc = data.get("serverContent")
                if not sc:
                    continue
                if sc.get("interrupted"):
                    # The user spoke over Bixy — Gemini cut the current reply off.
                    # Drop the partial coach text (never persisted as her line) and
                    # tell the browser to flush the queued audio at once, or the
                    # stale reply keeps playing behind the new one (the "loop").
                    state["assistant_transcript"] = ""
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
                    if state["user_transcript"] and not state["user_final_sent"]:
                        await websocket.send_json({"type": "transcript", "text": state["user_transcript"], "role": "user"})
                        state["user_final_sent"] = True
                    for part in model_turn.get("parts", []):
                        inline = part.get("inlineData") or part.get("inline_data")
                        if inline and inline.get("data"):
                            meter.note_egress(inline["data"])
                            await websocket.send_json({"type": "audio_out", "data": inline["data"]})
                if sc.get("turnComplete"):
                    coach = state["assistant_transcript"].strip()
                    if coach:
                        await websocket.send_json({"type": "response_text", "text": coach, "role": "assistant"})
                    await remember(state["user_transcript"].strip(), coach)
                    state["user_transcript"] = ""
                    state["assistant_transcript"] = ""
                    state["user_final_sent"] = False
                    await websocket.send_json({"type": "response_end"})
        except asyncio.CancelledError:
            pass
        except Exception as err:  # noqa: BLE001
            logger.error("assistant.receiver_error", error=str(err))
            try:
                await websocket.send_json({"type": "error", "message": "stream error"})
            except Exception:
                pass

    try:
        first = json.loads(await websocket.receive_text())
        if first.get("type") == "config":
            if isinstance(first.get("system_prompt"), str):
                state["system_prompt"] = first["system_prompt"][:8000]
            v = first.get("voice")
            state["voice"] = v if v in _LIVE_VOICES else _DEFAULT_VOICE
            if isinstance(first.get("tools"), list):
                state["tools"] = first["tools"]

        gemini_url = (
            "wss://generativelanguage.googleapis.com/ws/"
            "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
            f"?key={settings.gemini_prompt_api_key}"
        )
        gemini_ws = await websockets.connect(gemini_url, max_size=None)

        setup = {
            "setup": {
                "model": settings.gemini_assistant_model,
                "generation_config": {
                    "response_modalities": ["AUDIO"],
                    "speech_config": {"voice_config": {"prebuilt_voice_config": {"voice_name": state["voice"]}}},
                },
                "system_instruction": {"parts": [{"text": state["system_prompt"]}]},
                "input_audio_transcription": {},
                "output_audio_transcription": {},
            }
        }
        if state["tools"]:
            setup["setup"]["tools"] = state["tools"] + _SERVER_TOOLS
        else:
            setup["setup"]["tools"] = _SERVER_TOOLS
        await gemini_ws.send(json.dumps(setup))
        receiver_task = asyncio.create_task(receiver())

        while True:
            if time.monotonic() - started > _MAX_SECONDS:
                await websocket.send_json({"type": "error", "message": "assistant time limit reached"})
                break
            raw = await websocket.receive_text()
            if len(raw.encode("utf-8", "ignore")) > _MAX_MESSAGE_BYTES:
                continue
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
                        meter.note_egress(data)
                        await gemini_ws.send(json.dumps({
                            "realtime_input": {"audio": {"mime_type": "audio/pcm;rate=16000", "data": data}}
                        }))
            elif mtype == "text":
                t = (msg.get("text") or "")
                if isinstance(t, str):
                    t = t.strip()[:2000]
                if t and gemini_ws and gemini_ws.state.name == "OPEN":
                    await websocket.send_json({"type": "transcript", "text": t, "role": "user"})
                    await gemini_ws.send(json.dumps({
                        "client_content": {"turns": [{"role": "user", "parts": [{"text": t}]}], "turn_complete": True}
                    }))
            elif mtype == "tool_response":
                # Browser executed the tools; send results back to Gemini.
                responses = msg.get("responses")
                if isinstance(responses, list) and gemini_ws and gemini_ws.state.name == "OPEN":
                    await gemini_ws.send(json.dumps({"tool_response": {"function_responses": responses}}))
            elif mtype == "mic_off":
                mic_active = False
            elif mtype == "mic_on":
                mic_active = True

    except WebSocketDisconnect:
        logger.info("assistant.disconnected", sid=sid)
    except Exception as err:  # noqa: BLE001
        logger.error("assistant.error", error=str(err))
        try:
            await websocket.send_json({"type": "error", "message": "assistant error"})
        except Exception:
            pass
    finally:
        report_cost("assistant", meter, sid=sid, uid=uid)
        if _ACTIVE.get(sid) is websocket:
            _ACTIVE.pop(sid, None)
        if receiver_task:
            receiver_task.cancel()
        if gemini_ws and gemini_ws.state.name == "OPEN":
            await gemini_ws.close()
        await api.aclose()
