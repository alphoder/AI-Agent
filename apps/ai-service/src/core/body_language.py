"""Real-time body-language reading via Gemini Flash vision.

A webcam frame is analysed on the fly into a short text note (posture, eye
contact, gestures, expression, energy). Frames are NEVER stored — only the tiny
text note survives, which feeds the post-session body-language score.
"""
from __future__ import annotations

import httpx
import structlog

from src.config import settings

logger = structlog.get_logger(__name__)

_PROMPT = (
    "You are a communication coach watching one still frame of a person during a "
    "spoken practice session. In 15 words or fewer, describe their visible body "
    "language right now: posture, eye contact, hand gestures, facial expression, "
    "and energy. Be specific and neutral. Output only the description, no preamble."
)


async def analyze_frame(jpeg_base64: str) -> str | None:
    """Return a short body-language note for a single JPEG frame, or None on failure."""
    if not settings.gemini_api_key:
        return None

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_flash_model}:generateContent?key={settings.gemini_api_key}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": jpeg_base64}},
                    {"text": _PROMPT},
                ]
            }
        ],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 40},
    }
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return text[:280] or None
    except Exception as err:  # noqa: BLE001 — best-effort, never break the session
        logger.warning("body_language.analyze_failed", error=str(err))
        return None
