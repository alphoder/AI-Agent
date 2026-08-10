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
from src.core.origins import origin_allowed
from src.core.ws_ticket import verify_ticket

logger = structlog.get_logger(__name__)
router = APIRouter()

# All 30 Gemini Live prebuilt voices (verified against the live model). Must match
# packages/shared/voices.ts — a voice missing here silently falls back to default,
# which is exactly the bug that made every scenario sound the same.
_LIVE_VOICES = {
    "Charon", "Orus", "Puck", "Fenrir", "Enceladus", "Iapetus", "Umbriel", "Algieba",
    "Algenib", "Rasalgethi", "Alnilam", "Schedar", "Achird", "Zubenelgenubi", "Sadachbia",
    "Sadaltager", "Kore", "Aoede", "Leda", "Zephyr", "Callirrhoe", "Autonoe", "Despina",
    "Erinome", "Laomedeia", "Achernar", "Gacrux", "Pulcherrima", "Vindemiatrix", "Sulafat",
}
_DEFAULT_VOICE = "Charon"

# Lets the customer actually hang up — a real consequence when the agent fails to
# hook them, or a natural wrap when the call is done. Handled server-side.
_END_CALL_TOOL = {
    "function_declarations": [
        {
            "name": "end_call",
            "description": (
                "Hang up / end the phone call. Call this when you (the customer) have run out of "
                "patience (the agent gave no reason to stay, was too pushy, or you're genuinely busy), "
                "or when the conversation has naturally reached its end."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "reason": {
                        "type": "STRING",
                        "description": "short reason, e.g. 'no reason to stay', 'too pushy', 'genuinely busy', 'satisfied - will proceed'",
                    }
                },
            },
        }
    ]
}

_MIN_FRAME_INTERVAL_SEC = 6.0          # ignore body-language frames faster than this

# Our 2-letter codes -> the BCP-47 code sent as Gemini Live's `language_code`.
#
# VERIFIED 2026-08-08 against models/gemini-3.1-flash-live-preview with our key
# (scripts/verify_live_capabilities.py): all 74 languages below answer the phone
# idiomatically and in the correct script.
#
# What actually forces the language is the directive at the top of the system
# prompt (buildSystemPrompt, apps/api/src/utils/prompt-bundle.ts) — NOT this
# field. Probed alone, `language_code: "hi-IN"` still replied in English, and the
# server accepts nonsense like "xx-ZZ" without complaint. Keep both: the prompt
# decides what is spoken, this pins recognition of the LEARNER's speech.
#
# Previously this map held 26 entries while the picker offered 74 languages, so
# 48 of them were sent with no language_code at all.
_BCP47 = {
    # Europe
    "en": "en-US", "es": "es-US", "fr": "fr-FR", "de": "de-DE", "it": "it-IT",
    "pt": "pt-BR", "nl": "nl-NL", "ru": "ru-RU", "uk": "uk-UA", "pl": "pl-PL",
    "cs": "cs-CZ", "sk": "sk-SK", "ro": "ro-RO", "hu": "hu-HU", "el": "el-GR",
    "bg": "bg-BG", "sr": "sr-RS", "hr": "hr-HR", "sl": "sl-SI", "sv": "sv-SE",
    "no": "nb-NO", "da": "da-DK", "fi": "fi-FI", "is": "is-IS", "et": "et-EE",
    "lv": "lv-LV", "lt": "lt-LT", "ca": "ca-ES", "eu": "eu-ES", "gl": "gl-ES",
    "cy": "cy-GB", "ga": "ga-IE", "sq": "sq-AL",
    # Middle East & Central Asia
    "tr": "tr-TR", "ar": "ar-XA", "he": "he-IL", "fa": "fa-IR", "hy": "hy-AM",
    "az": "az-AZ", "ka": "ka-GE", "kk": "kk-KZ", "uz": "uz-UZ", "mn": "mn-MN",
    # South Asia
    "hi": "hi-IN", "bn": "bn-IN", "pa": "pa-IN", "gu": "gu-IN", "mr": "mr-IN",
    "ta": "ta-IN", "te": "te-IN", "kn": "kn-IN", "ml": "ml-IN", "ur": "ur-IN",
    "ne": "ne-NP", "si": "si-LK",
    # South-East & East Asia
    "th": "th-TH", "lo": "lo-LA", "km": "km-KH", "my": "my-MM", "vi": "vi-VN",
    "id": "id-ID", "ms": "ms-MY", "tl": "fil-PH", "zh": "cmn-CN", "cmn": "cmn-CN",
    "yue": "yue-HK", "ja": "ja-JP", "ko": "ko-KR",
    # Africa
    "sw": "sw-KE", "am": "am-ET", "ha": "ha-NG", "yo": "yo-NG", "ig": "ig-NG",
    "zu": "zu-ZA", "af": "af-ZA",
}


def _bcp47(lang: str) -> str | None:
    """Selected lang -> BCP-47 for Gemini, or None to leave it auto-detected."""
    if "-" in lang:
        return lang  # already region-qualified
    return _BCP47.get(lang)
# Language codes Gemini 2.5 native audio actually accepts. VERIFIED 2026-08-10
# against this key with scripts/verify_live_capabilities.py (18 of 74 replied).
# Native audio hard-closes the socket with 1007 "Unsupported language code" on
# anything else, so this list must never be widened by guesswork — re-run the
# script and paste the result.
#
# Note what is NOT here: every regional accent fails — en-IN, en-GB, en-AU,
# en-IE, es-ES, fr-CA, pt-PT. Accented sessions therefore stay on flash-live,
# which handles all 23 accent codes. en-IN in particular is a common pick, so
# most English calls will still route to flash-live by design.
_NATIVE_AUDIO_LANGS = frozenset({
    "en-US", "es-US", "fr-FR", "pt-BR", "de-DE", "it-IT", "nl-NL", "ru-RU",
    "uk-UA", "pl-PL", "ro-RO", "tr-TR", "hi-IN", "th-TH", "vi-VN", "id-ID",
    "ja-JP", "ko-KR",
})


def _live_model(bcp: str | None) -> tuple[str, bool]:
    """Pick the live model for a resolved BCP-47 code.

    Returns (model, affective_dialog). Native audio only where its support is
    verified; everything else — unknown codes, every accent, and None — falls
    back to flash-live, which is the model that covers all 74 languages.
    Self-check: python scripts/test_model_routing.py
    """
    if settings.native_audio_enabled and bcp in _NATIVE_AUDIO_LANGS:
        return settings.gemini_native_audio_model, True
    return settings.gemini_live_model, False


_MAX_MESSAGE_BYTES = 2_000_000         # ~2 MB cap per inbound message
_MAX_MESSAGES_PER_SEC = 60             # flood guard
_MAX_SESSION_SECONDS = 1800            # hard cap on the socket, ringing included
# The call itself is capped at 5 minutes, measured from the customer's FIRST WORD.
# The browser enforces it (it owns the visible clock); this is the backstop for a
# client that stops counting, hence the grace period.
_MAX_CALL_SECONDS = 300
_CALL_CAP_GRACE = 20

# One live socket per session id (hijack / double-connect guard).
_ACTIVE_SESSIONS: set[str] = set()


def _internal_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.api_gateway_url,
        headers={"Content-Type": "application/json", "X-Internal-Key": settings.internal_api_key},
        timeout=10.0,
    )


@router.websocket("/ws/session")
async def session_ws(websocket: WebSocket):
    # ---- Authenticate BEFORE accepting the socket ----
    # The ticket is the primary auth; the origin check is defence-in-depth
    # against CSWSH (loopback + allow-listed origins only).
    ticket = verify_ticket(websocket.query_params.get("ticket", ""))
    if not ticket:
        await websocket.close(code=1008)  # policy violation
        return
    if not origin_allowed(websocket.headers.get("origin")):
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
        "opener_done": False,      # the customer has finished their first turn
        "first_audio_at": None,    # monotonic time of their first word
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
                    # Hand the customer the turn so THEY speak first. Without this
                    # the model waits for audio, and since the learner's mic stays
                    # shut until the opener finishes, nobody would ever speak.
                    await gemini_ws.send(json.dumps({
                        "client_content": {
                            "turns": [{"role": "user", "parts": [{"text": "[The call connects.]"}]}],
                            "turn_complete": True,
                        }
                    }))
                    continue
                # The customer decided to hang up → log it as a scored signal and end.
                tool_call = data.get("toolCall")
                if tool_call and tool_call.get("functionCalls"):
                    for call in tool_call["functionCalls"]:
                        if call.get("name") == "end_call":
                            reason = (call.get("args") or {}).get("reason", "ended the call")
                            state["turn"] += 1
                            try:
                                await api.post("/api/internal/transcripts", json={
                                    "session_id": session_id,
                                    "turn_number": state["turn"],
                                    "system_content": f"[Customer ended the call: {reason}]",
                                })
                            except Exception as err:  # noqa: BLE001
                                logger.warning("session.end_call_persist_failed", error=str(err))
                            try:
                                await websocket.send_json({"type": "call_ended", "reason": reason})
                                await websocket.close()  # unblocks the client loop → session teardown
                            except Exception:
                                pass
                            return
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
                            # Their first word starts the call clock.
                            if state["first_audio_at"] is None:
                                state["first_audio_at"] = time.monotonic()
                            await websocket.send_json({"type": "audio_out", "data": inline["data"]})
                if sc.get("turnComplete"):
                    # The opening line is done: the learner's mic opens from here.
                    if not state["opener_done"]:
                        state["opener_done"] = True
                        await websocket.send_json({"type": "opener_done"})
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

        bcp = _bcp47(lang)
        speech_config = {"voice_config": {"prebuilt_voice_config": {"voice_name": state["voice"]}}}
        if bcp:
            speech_config["language_code"] = bcp  # pin understanding + output to the chosen language
        live_model, affective = _live_model(bcp)
        # Which model served a call is otherwise unknowable from the logs, and
        # with two backends "the call misbehaved" is not answerable without it.
        logger.info("session.live_model", model=live_model, lang=bcp, affective=affective)
        generation_config: dict = {
            "response_modalities": ["AUDIO"],
            "speech_config": speech_config,
        }
        system_prompt = state["system_prompt"]
        if affective:
            # Native audio only; flash-live answers this flag with a 1011.
            generation_config["enable_affective_dialog"] = True
            # The flag lets the model HEAR the learner's tone. Nothing in the
            # persona prompt asks it to DO anything with that, so the capability
            # was on and unused. This is appended only on the affective path —
            # flash-live cannot read tone, and telling it to would invite it to
            # invent emotions it never heard.
            system_prompt += (
                "\n\n## Listen to how they sound\n"
                "You can hear their tone, not just their words. React to it as a person would: "
                "if they sound nervous or unsure, you get less patient with the waffle; if they "
                "sound confident and warm, you soften and give them more room; if they sound "
                "pushy or rehearsed, you get guarded. Never name their tone out loud or coach "
                "them on it — you are the customer, not their trainer. Just let it change how "
                "you treat them."
            )
        setup_msg = {
            "setup": {
                "model": live_model,
                "generation_config": generation_config,
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "input_audio_transcription": {},
                "output_audio_transcription": {},
                "tools": [_END_CALL_TOOL],
            }
        }
        await gemini_ws.send(json.dumps(setup_msg))
        receiver_task = asyncio.create_task(gemini_receiver())

        # 2. client loop (hardened)
        while True:
            if time.monotonic() - started > _MAX_SESSION_SECONDS:
                await websocket.send_json({"type": "error", "message": "session time limit reached"})
                break

            # The call clock runs from the customer's first word. The browser owns
            # the visible timer and normally ends the call itself; this only catches
            # a client that stopped counting, hence the grace.
            spoke_at = state["first_audio_at"]
            if spoke_at is not None and time.monotonic() - spoke_at > _MAX_CALL_SECONDS + _CALL_CAP_GRACE:
                await websocket.send_json({"type": "error", "message": "call time limit reached"})
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
                # Nothing the learner's room makes is heard until the customer has
                # actually said their piece. A real call does not transmit before
                # the other person has spoken, and stray noise during the opener
                # used to interrupt it.
                if not state["opener_done"]:
                    continue
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
