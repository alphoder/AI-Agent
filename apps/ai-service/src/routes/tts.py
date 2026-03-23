"""TTS preview route — generates a short voice sample.

GROQ_SWAP: Uses Deepgram Aura TTS when TTS_PROVIDER=deepgram,
OpenAI TTS when TTS_PROVIDER=openai. Set in .env to switch.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from fastapi.responses import Response

import structlog

from src.config import settings
from src.core.tts import get_tts_client, DeepgramTTSClient

logger = structlog.get_logger(__name__)

router = APIRouter()

# GROQ_SWAP: Deepgram Aura voices (used when TTS_PROVIDER=deepgram)
DEEPGRAM_VOICES = {
    "asteria": "aura-asteria-en",   # female
    "orion": "aura-orion-en",       # male
    "luna": "aura-luna-en",         # female, soft
    "arcas": "aura-arcas-en",       # male, deep
    "stella": "aura-stella-en",     # female, warm
    "hera": "aura-hera-en",         # female, professional
    "athena": "aura-athena-en",     # female, clear
    "zeus": "aura-zeus-en",         # male, authoritative
}

# OpenAI voices (used when TTS_PROVIDER=openai)
OPENAI_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}

PREVIEW_TEXT = (
    "Hello! I'm your AI training avatar. "
    "Let's get started with your practice session."
)


class VoicePreviewRequest(BaseModel):
    voice: str
    text: Optional[str] = None
    speed: float = 1.0

    @field_validator("speed")
    @classmethod
    def validate_speed(cls, v: float) -> float:
        if not 0.25 <= v <= 4.0:
            raise ValueError("speed must be between 0.25 and 4.0")
        return v


@router.post("/preview")
async def voice_preview(req: VoicePreviewRequest) -> Response:
    """Generate a short TTS audio clip for voice preview.

    GROQ_SWAP: Routes to Deepgram Aura or OpenAI TTS based on config.
    """
    text = req.text or PREVIEW_TEXT

    # GROQ_SWAP: Use Deepgram Aura TTS
    if settings.tts_provider == "deepgram":
        if not settings.deepgram_api_key:
            raise HTTPException(status_code=503, detail="Deepgram API key not configured")

        # Map voice name to Deepgram model
        model = DEEPGRAM_VOICES.get(req.voice, settings.deepgram_tts_model)

        try:
            import httpx
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"https://api.deepgram.com/v1/speak?model={model}&encoding=mp3",
                    headers={
                        "Authorization": f"Token {settings.deepgram_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"text": text},
                )

                if resp.status_code != 200:
                    logger.error("tts.deepgram_error", status=resp.status_code, body=resp.text[:200])
                    raise HTTPException(status_code=502, detail="TTS generation failed")

                return Response(
                    content=resp.content,
                    media_type="audio/mpeg",
                    headers={
                        "Cache-Control": "public, max-age=86400",
                        "Content-Disposition": f'inline; filename="preview-{req.voice}.mp3"',
                    },
                )

        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="TTS generation timed out")
        except HTTPException:
            raise
        except Exception as e:
            logger.error("tts.unexpected_error", error=str(e))
            raise HTTPException(status_code=500, detail="Internal TTS error")

    else:
        # OpenAI TTS (original path)
        if not settings.openai_api_key:
            raise HTTPException(status_code=503, detail="OpenAI API key not configured — TTS preview unavailable")

        if req.voice not in OPENAI_VOICES:
            raise HTTPException(status_code=400, detail=f"voice must be one of {OPENAI_VOICES}")

        try:
            import httpx
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={
                        "Authorization": f"Bearer {settings.openai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "tts-1",
                        "input": text,
                        "voice": req.voice,
                        "speed": req.speed,
                        "response_format": "mp3",
                    },
                )

                if resp.status_code != 200:
                    logger.error("tts.openai_error", status=resp.status_code, body=resp.text[:200])
                    raise HTTPException(status_code=502, detail="TTS generation failed")

                return Response(
                    content=resp.content,
                    media_type="audio/mpeg",
                    headers={
                        "Cache-Control": "public, max-age=86400",
                        "Content-Disposition": f'inline; filename="preview-{req.voice}.mp3"',
                    },
                )

        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="TTS generation timed out")
        except HTTPException:
            raise
        except Exception as e:
            logger.error("tts.unexpected_error", error=str(e))
            raise HTTPException(status_code=500, detail="Internal TTS error")
