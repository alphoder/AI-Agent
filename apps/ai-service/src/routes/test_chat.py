"""WebSocket endpoint for avatar test chat.

Lightweight pipeline: browser audio → Deepgram STT → GPT-4o → OpenAI TTS → PCM16 audio back.
The browser forwards the TTS audio to SimliClient for lip-sync rendering.
"""
import asyncio
import io
import json
import struct
from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from openai import AsyncOpenAI

from src.config import settings

logger = structlog.get_logger(__name__)
router = APIRouter()

# Reuse OpenAI client
_openai_client: Optional[AsyncOpenAI] = None


def get_openai() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


@router.websocket("/ws/test-chat")
async def test_chat_ws(websocket: WebSocket):
    """WebSocket for test chat pipeline.

    Protocol:
    - Client sends JSON: {"type": "config", "avatar_name": "Coach", "system_prompt": "..."}
    - Client sends JSON: {"type": "audio", "data": "<base64 PCM16 16kHz>"}
    - Client sends JSON: {"type": "text", "text": "user message"}
    - Server sends JSON: {"type": "transcript", "text": "...", "role": "user"}
    - Server sends JSON: {"type": "response_text", "text": "...", "role": "assistant"}
    - Server sends JSON: {"type": "audio", "data": "<base64 PCM16 16kHz>"}
    - Server sends JSON: {"type": "audio_end"}
    - Server sends JSON: {"type": "error", "message": "..."}
    """
    await websocket.accept()
    logger.info("test_chat.connected")

    system_prompt = "You are a helpful AI training coach. Keep responses brief (1-2 sentences). Be natural and conversational."
    conversation_history: list[dict] = []
    deepgram_ws = None
    transcript_buffer = ""
    openai = get_openai()

    # Deepgram streaming connection
    deepgram_url = f"wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&model=nova-2&punctuate=true&interim_results=false&endpointing=300"

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "config":
                # Update system prompt
                avatar_name = msg.get("avatar_name", "Coach")
                custom_prompt = msg.get("system_prompt")
                if custom_prompt:
                    system_prompt = custom_prompt
                else:
                    system_prompt = f"You are {avatar_name}, an AI training coach. Have a natural conversation. Keep responses to 1-2 sentences. Be helpful, friendly, and professional."
                conversation_history.clear()
                logger.info("test_chat.configured", avatar_name=avatar_name)

            elif msg_type == "text":
                # Direct text input — skip STT
                user_text = msg.get("text", "").strip()
                if not user_text:
                    continue

                await websocket.send_json({"type": "transcript", "text": user_text, "role": "user"})

                # Run LLM + TTS pipeline
                await _process_response(websocket, openai, system_prompt, conversation_history, user_text)

            elif msg_type == "audio":
                # Audio chunk from browser mic — use Deepgram STT
                import base64
                audio_data = base64.b64decode(msg.get("data", ""))

                if not audio_data:
                    continue

                # For simplicity in test mode, use Whisper API instead of streaming Deepgram
                # (Deepgram streaming requires maintaining a persistent WebSocket which adds complexity)
                # Buffer audio and transcribe when we get a pause signal
                # Actually, let's use OpenAI Whisper for simplicity
                pass  # Audio handled by audio_complete

            elif msg_type == "audio_complete":
                # Full audio recording from browser — transcribe with Whisper
                import base64
                audio_data = base64.b64decode(msg.get("data", ""))

                if len(audio_data) < 3200:  # Less than 0.1s of audio
                    continue

                try:
                    # Convert PCM16 to WAV for Whisper
                    wav_buffer = _pcm16_to_wav(audio_data, sample_rate=16000)

                    # Transcribe with Whisper
                    transcript = await openai.audio.transcriptions.create(
                        model="whisper-1",
                        file=("audio.wav", wav_buffer, "audio/wav"),
                        language="en",
                    )

                    user_text = transcript.text.strip()
                    if not user_text:
                        continue

                    await websocket.send_json({"type": "transcript", "text": user_text, "role": "user"})

                    # Run LLM + TTS pipeline
                    await _process_response(websocket, openai, system_prompt, conversation_history, user_text)

                except Exception as e:
                    logger.error("test_chat.stt_error", error=str(e))
                    await websocket.send_json({"type": "error", "message": f"Speech recognition failed: {str(e)}"})

    except WebSocketDisconnect:
        logger.info("test_chat.disconnected")
    except Exception as e:
        logger.error("test_chat.error", error=str(e))
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


async def _process_response(
    websocket: WebSocket,
    openai: AsyncOpenAI,
    system_prompt: str,
    history: list[dict],
    user_text: str,
):
    """Run LLM → TTS pipeline and send audio back."""
    import base64

    # Add user message to history
    history.append({"role": "user", "content": user_text})

    # Keep last 10 turns
    messages = [{"role": "system", "content": system_prompt}] + history[-10:]

    try:
        # GPT-4o response (non-streaming for simplicity — collect full response for TTS)
        completion = await openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=150,
            temperature=0.7,
        )

        assistant_text = completion.choices[0].message.content or ""
        if not assistant_text:
            return

        # Add to history
        history.append({"role": "assistant", "content": assistant_text})

        # Send response text to browser
        await websocket.send_json({"type": "response_text", "text": assistant_text, "role": "assistant"})

        # Generate TTS audio (PCM16 format for Simli)
        tts_response = await openai.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=assistant_text,
            response_format="pcm",  # Raw PCM16 24kHz
        )

        # Read all audio bytes
        audio_bytes = tts_response.content

        # Resample from 24kHz to 16kHz for Simli
        resampled = _resample_pcm16(audio_bytes, from_rate=24000, to_rate=16000)

        # Send audio in chunks (8KB each) to avoid WebSocket frame size issues
        chunk_size = 8192
        for i in range(0, len(resampled), chunk_size):
            chunk = resampled[i:i + chunk_size]
            await websocket.send_json({
                "type": "audio",
                "data": base64.b64encode(chunk).decode("ascii"),
            })

        await websocket.send_json({"type": "audio_end"})

    except Exception as e:
        logger.error("test_chat.pipeline_error", error=str(e))
        await websocket.send_json({"type": "error", "message": f"Response generation failed: {str(e)}"})


def _pcm16_to_wav(pcm_data: bytes, sample_rate: int = 16000, channels: int = 1) -> io.BytesIO:
    """Convert raw PCM16 bytes to WAV format for Whisper API."""
    buf = io.BytesIO()
    # WAV header
    data_size = len(pcm_data)
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))  # chunk size
    buf.write(struct.pack("<H", 1))   # PCM format
    buf.write(struct.pack("<H", channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", sample_rate * channels * 2))  # byte rate
    buf.write(struct.pack("<H", channels * 2))  # block align
    buf.write(struct.pack("<H", 16))  # bits per sample
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_data)
    buf.seek(0)
    return buf


def _resample_pcm16(data: bytes, from_rate: int, to_rate: int) -> bytes:
    """Simple linear interpolation resample for PCM16."""
    if from_rate == to_rate:
        return data

    # Unpack samples
    n_samples = len(data) // 2
    samples = struct.unpack(f"<{n_samples}h", data)

    ratio = from_rate / to_rate
    new_n = int(n_samples / ratio)
    resampled = []

    for i in range(new_n):
        src_idx = i * ratio
        idx = int(src_idx)
        frac = src_idx - idx

        if idx + 1 < n_samples:
            val = samples[idx] * (1 - frac) + samples[idx + 1] * frac
        else:
            val = samples[min(idx, n_samples - 1)]

        resampled.append(int(max(-32768, min(32767, val))))

    return struct.pack(f"<{len(resampled)}h", *resampled)
