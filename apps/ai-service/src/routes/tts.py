"""TTS preview route — generates a short voice sample via OpenAI TTS."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from fastapi.responses import Response

import structlog

from src.config import settings

logger = structlog.get_logger(__name__)

router = APIRouter()

ALLOWED_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
PREVIEW_TEXT = (
    "Hello! I'm your AI training avatar. "
    "Let's get started with your practice session."
)


class VoicePreviewRequest(BaseModel):
    voice: str
    text: Optional[str] = None
    speed: float = 1.0

    @field_validator("voice")
    @classmethod
    def validate_voice(cls, v: str) -> str:
        if v not in ALLOWED_VOICES:
            raise ValueError(f"voice must be one of {ALLOWED_VOICES}")
        return v

    @field_validator("speed")
    @classmethod
    def validate_speed(cls, v: float) -> float:
        if not 0.25 <= v <= 4.0:
            raise ValueError("speed must be between 0.25 and 4.0")
        return v


@router.post("/preview")
async def voice_preview(req: VoicePreviewRequest) -> Response:
    """Generate a short TTS audio clip for voice preview."""
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured — TTS preview unavailable",
        )

    try:
        import httpx

        text = req.text or PREVIEW_TEXT

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
                logger.error(
                    "tts.openai_error",
                    status=resp.status_code,
                    body=resp.text[:200],
                )
                raise HTTPException(status_code=502, detail="TTS generation failed")

            return Response(
                content=resp.content,
                media_type="audio/mpeg",
                headers={
                    "Cache-Control": "public, max-age=86400",  # cache 24h
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
