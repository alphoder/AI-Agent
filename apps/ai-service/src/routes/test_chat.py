"""WebSocket endpoint for avatar test chat — real-time conversation mode.

GROQ_SWAP: Uses LLMClient (Groq or OpenAI) + TTSClient (Deepgram or OpenAI).
Pipeline: streaming mic audio → Deepgram streaming STT → LLM → TTS → audio back.

The browser streams raw PCM16 audio continuously. Deepgram detects speech
boundaries (endpointing) and emits final transcripts. Each final transcript
triggers the LLM → TTS pipeline. The result is a natural, real-time conversation.
"""
import asyncio
import json
import base64
from typing import Optional

import httpx
import websockets
import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.config import settings
from src.core.llm import LLMClient
from src.core.tts import get_tts_client

logger = structlog.get_logger(__name__)
router = APIRouter()

_llm_client: Optional[LLMClient] = None
_tts_client = None


def get_llm() -> LLMClient:
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client


def get_tts():
    global _tts_client
    if _tts_client is None:
        _tts_client = get_tts_client()
    return _tts_client


@router.websocket("/ws/test-chat")
async def test_chat_ws(websocket: WebSocket):
    """Real-time voice conversation via WebSocket.

    Protocol:
    Client → Server:
      {"type": "config", "avatar_name": "Coach"}     — configure session
      {"type": "audio", "data": "<base64 PCM16>"}    — streaming mic audio chunks
      {"type": "text", "text": "hello"}               — text input (bypasses STT)
      {"type": "mic_off"}                              — stop listening
      {"type": "mic_on"}                               — resume listening

    Server → Client:
      {"type": "transcript_interim", "text": "..."}   — partial STT result
      {"type": "transcript", "text": "...", "role": "user"}  — final STT result
      {"type": "response_text", "text": "...", "role": "assistant"}
      {"type": "audio", "data": "<base64 PCM16>"}    — TTS audio chunk
      {"type": "audio_end"}                            — end of TTS audio
      {"type": "listening"}                            — STT connected, ready
      {"type": "error", "message": "..."}
    """
    await websocket.accept()
    logger.info("test_chat.connected")

    system_prompt = "You are a helpful AI training coach. Keep responses brief (1-2 sentences). Be natural and conversational."
    conversation_history: list[dict] = []
    llm = get_llm()
    tts = get_tts()
    deepgram_ws = None
    processing_lock = asyncio.Lock()
    mic_active = True

    async def connect_deepgram():
        """Open streaming Deepgram STT WebSocket.

        endpointing=900: wait 900ms of silence before flagging interim-final
        (was 300 — caused premature sends on natural speech pauses).
        utterance_end_ms=1500: only emit UtteranceEnd / speech_final after
        1.5s of continuous silence (was 1000).
        """
        url = (
            "wss://api.deepgram.com/v1/listen"
            "?encoding=linear16&sample_rate=16000&channels=1"
            "&model=nova-2&language=en&punctuate=true&smart_format=true"
            "&interim_results=true&endpointing=900"
            "&vad_events=true&utterance_end_ms=1500"
        )
        headers = {"Authorization": f"Token {settings.deepgram_api_key}"}
        ws = await websockets.connect(url, additional_headers=headers)
        logger.info("test_chat.deepgram_connected")
        return ws

    async def deepgram_receiver(dg_ws):
        """Listen for Deepgram STT results and trigger LLM pipeline."""
        nonlocal conversation_history
        try:
            async for raw_msg in dg_ws:
                data = json.loads(raw_msg)
                msg_type = data.get("type")

                if msg_type == "Results":
                    channel = data.get("channel", {})
                    alternatives = channel.get("alternatives", [])
                    if not alternatives:
                        continue

                    transcript = alternatives[0].get("transcript", "").strip()
                    is_final = data.get("is_final", False)
                    speech_final = data.get("speech_final", False)

                    if not transcript:
                        continue

                    if not is_final:
                        # Interim result — show typing indicator
                        await websocket.send_json({
                            "type": "transcript_interim",
                            "text": transcript,
                        })
                    elif speech_final:
                        # Only trigger the LLM on a real end-of-speech marker
                        # (speech_final is set after utterance_end_ms silence).
                        # Ignoring bare `is_final` prevents premature sends on
                        # mid-thought pauses.
                        logger.info("test_chat.user_said", text=transcript[:80])
                        await websocket.send_json({
                            "type": "transcript",
                            "text": transcript,
                            "role": "user",
                        })

                        # Process response (with lock to prevent overlapping)
                        async with processing_lock:
                            await _process_response(
                                websocket, llm, tts,
                                system_prompt, conversation_history,
                                transcript,
                            )

                elif msg_type == "UtteranceEnd":
                    # Deepgram detected end of utterance
                    pass

        except websockets.ConnectionClosed:
            logger.info("test_chat.deepgram_closed")
        except Exception as e:
            logger.error("test_chat.deepgram_receiver_error", error=str(e))

    try:
        # Connect to Deepgram streaming STT
        deepgram_ws = await connect_deepgram()
        await websocket.send_json({"type": "listening"})

        # Start receiver task
        receiver_task = asyncio.create_task(deepgram_receiver(deepgram_ws))

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "config":
                avatar_name = msg.get("avatar_name", "Coach")
                custom_prompt = msg.get("system_prompt")
                if custom_prompt:
                    system_prompt = custom_prompt
                else:
                    system_prompt = (
                        f"You are {avatar_name}, an AI training coach. "
                        "Have a natural conversation. Keep responses to 1-2 sentences. "
                        "Be helpful, friendly, and professional."
                    )
                conversation_history.clear()
                logger.info("test_chat.configured", avatar_name=avatar_name)

            elif msg_type == "audio":
                # Stream raw PCM16 audio to Deepgram
                if mic_active and deepgram_ws and deepgram_ws.state.name == "OPEN":
                    audio_bytes = base64.b64decode(msg.get("data", ""))
                    if audio_bytes:
                        await deepgram_ws.send(audio_bytes)

            elif msg_type == "text":
                user_text = msg.get("text", "").strip()
                if not user_text:
                    continue
                await websocket.send_json({
                    "type": "transcript",
                    "text": user_text,
                    "role": "user",
                })
                async with processing_lock:
                    await _process_response(
                        websocket, llm, tts,
                        system_prompt, conversation_history,
                        user_text,
                    )

            elif msg_type == "mic_off":
                mic_active = False

            elif msg_type == "mic_on":
                mic_active = True

            elif msg_type == "audio_complete":
                # Legacy push-to-talk: transcribe full recording via REST
                audio_data = base64.b64decode(msg.get("data", ""))
                if len(audio_data) < 3200:
                    continue
                try:
                    user_text = await _transcribe_audio_rest(audio_data)
                    if not user_text:
                        continue
                    await websocket.send_json({
                        "type": "transcript",
                        "text": user_text,
                        "role": "user",
                    })
                    async with processing_lock:
                        await _process_response(
                            websocket, llm, tts,
                            system_prompt, conversation_history,
                            user_text,
                        )
                except Exception as e:
                    logger.error("test_chat.stt_error", error=str(e))
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Speech recognition failed: {str(e)}",
                    })

    except WebSocketDisconnect:
        logger.info("test_chat.disconnected")
    except Exception as e:
        logger.error("test_chat.error", error=str(e))
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if deepgram_ws and deepgram_ws.state.name == "OPEN":
            await deepgram_ws.close()


async def _transcribe_audio_rest(pcm_data: bytes) -> str:
    """Fallback: transcribe via Deepgram REST API (for push-to-talk mode)."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=en&punctuate=true",
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": "audio/raw;encoding=linear16;sample_rate=16000;channels=1",
            },
            content=pcm_data,
        )
        response.raise_for_status()
        data = response.json()

    alternatives = (
        data.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])
    )
    if alternatives:
        return alternatives[0].get("transcript", "").strip()
    return ""


async def _process_response(
    websocket: WebSocket,
    llm: LLMClient,
    tts,  # kept for signature compatibility; unused — HeyGen does TTS on the client
    system_prompt: str,
    history: list[dict],
    user_text: str,
):
    """Stream the LLM response as sentences of plain text.

    In the HeyGen-only deployment, our AI service no longer synthesizes audio.
    We just hand each completed sentence back to the browser via WebSocket;
    the frontend then calls `avatar.speak({ text, taskType: REPEAT })` on the
    HeyGen SDK, which renders the TTS + lip-sync at the edge. Cuts our
    pipeline down to STT + LLM, which keeps end-to-end latency low and
    removes a whole category of audio-routing bugs.
    """
    del tts  # deliberately unused
    history.append({"role": "user", "content": user_text})

    try:
        full_response = ""
        sentence_buffer = ""
        # Sentence boundaries across scripts — Latin + Hindi danda + CJK.
        boundaries = {".", "!", "?", ";", ":", "।", "。", "！", "？"}

        async for chunk in llm.generate_response(
            system_prompt=system_prompt,
            conversation_history=[
                {"role": h["role"], "content": h["content"]}
                for h in history[-10:]
                if h["role"] in ("user", "assistant")
            ],
            current_utterance=user_text,
            max_tokens=150,
        ):
            full_response += chunk + " "
            sentence_buffer += chunk + " "

            has_boundary = any(c in sentence_buffer for c in boundaries)
            if has_boundary and len(sentence_buffer.strip()) > 10:
                sentence = sentence_buffer.strip()
                sentence_buffer = ""
                await websocket.send_json({
                    "type": "response_text",
                    "text": sentence,
                    "role": "assistant",
                })

        remainder = sentence_buffer.strip()
        if remainder:
            await websocket.send_json({
                "type": "response_text",
                "text": remainder,
                "role": "assistant",
            })

        full_response = full_response.strip()
        if full_response:
            history.append({"role": "assistant", "content": full_response})

        # Keeps the existing client-side contract — the frontend listens for
        # response_end to stop its "thinking" indicator. Renamed from audio_end.
        await websocket.send_json({"type": "response_end"})

    except Exception as e:
        logger.error("test_chat.pipeline_error", error=str(e))
        await websocket.send_json({
            "type": "error",
            "message": f"Response generation failed: {str(e)}",
        })
