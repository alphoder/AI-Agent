"""Rate a one-minute impromptu speech (the "speak for a minute" drill).

Runs on Gemini Flash Lite (key 1): effectively free, so the drill is never
metered. Internal-key protected (called via the API gateway).

The transcript arrives from the BROWSER's speech recognition, so it has no
punctuation, mishears names, and drops the odd word. The prompt says so
explicitly — otherwise the model marks people down for "grammar" that is really
just transcription noise, which is both wrong and discouraging.
"""
from __future__ import annotations

import json

import httpx
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config import settings

logger = structlog.get_logger(__name__)
router = APIRouter()

_SYSTEM = (
    "You coach impromptu public speaking. The speaker got a topic, had a short prep, "
    "and then spoke for up to one minute. Rate what they actually said.\n\n"
    "The transcript comes from automatic speech recognition: there is NO punctuation, "
    "words are occasionally misheard, and the end may be cut off mid-sentence. "
    "NEVER criticise grammar, spelling or punctuation — you cannot observe them. "
    "Judge only thinking and structure.\n\n"
    "Score each 0-100:\n"
    "- structure: did it open, develop and close? Was there a spine, or a list of loose thoughts?\n"
    "- ideas: originality and depth. Did they find an angle, or state the obvious?\n"
    "- reasoning: are claims supported with a reason, example or contrast?\n"
    "- delivery: fluency and momentum, judged from pacing and filler density only.\n"
    "overall = your holistic judgement, not a strict average.\n\n"
    "Be specific and kind. Quote their own words when you praise or correct. "
    "A nervous first-timer must finish reading this wanting to go again.\n"
    "If they spoke for under 15 seconds or said almost nothing, score low and say plainly "
    "that there was not enough to judge.\n\n"
    'Output STRICT JSON only: {"overall": int, "structure": int, "ideas": int, '
    '"reasoning": int, "delivery": int, "verdict": string, "strengths": [string], '
    '"improvements": [string], "next_time": string}\n'
    "verdict: one sentence. strengths/improvements: 2-3 items each, max 20 words. "
    "next_time: one concrete thing to try in the next attempt."
)


class RateRequest(BaseModel):
    topic: str
    transcript: str
    duration_sec: int = 60
    words: int = 0
    fillers: int = 0


def _clamp(v: object, lo: int = 0, hi: int = 100) -> int:
    try:
        return max(lo, min(hi, int(v)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0


def _lines(v: object, cap: int = 3) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip() for x in v[:cap] if str(x).strip()]


@router.post("/rate")
async def rate_speech(body: RateRequest):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="speech rating is not configured")
    if not body.topic.strip():
        raise HTTPException(status_code=400, detail="topic is required")

    said = body.transcript.strip()
    if len(said) < 20:
        # Not worth a model call, and a real rating here would be noise.
        return {
            "overall": 0, "structure": 0, "ideas": 0, "reasoning": 0, "delivery": 0,
            "verdict": "There was not enough speech to rate.",
            "strengths": [], "improvements": ["Try to keep talking for the full minute, even if you repeat yourself."],
            "next_time": "Open with your answer in one sentence, then give a reason for it.",
        }

    prompt = (
        f"TOPIC: {body.topic[:300]}\n"
        f"SPOKE FOR: {body.duration_sec}s · {body.words} words · {body.fillers} filler words\n\n"
        f"TRANSCRIPT:\n{said[:6000]}"
    )
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_flash_model}:generateContent?key={settings.gemini_api_key}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.6, "maxOutputTokens": 700, "responseMimeType": "application/json"},
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        out = json.loads(data["candidates"][0]["content"]["parts"][0]["text"])
        return {
            "overall": _clamp(out.get("overall")),
            "structure": _clamp(out.get("structure")),
            "ideas": _clamp(out.get("ideas")),
            "reasoning": _clamp(out.get("reasoning")),
            "delivery": _clamp(out.get("delivery")),
            "verdict": str(out.get("verdict", "")).strip(),
            "strengths": _lines(out.get("strengths")),
            "improvements": _lines(out.get("improvements")),
            "next_time": str(out.get("next_time", "")).strip(),
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("speech_rate.failed", error=str(exc))
        raise HTTPException(status_code=502, detail="speech rating failed") from exc
