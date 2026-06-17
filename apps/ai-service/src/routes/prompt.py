"""Prompt redesign — turn a user's rough idea into an optimised agent prompt.

Uses the SECOND Gemini key (gemini_prompt_api_key) with Gemini 3.1 Flash Lite,
kept entirely server-side. Internal-key protected (called via the API gateway).
"""
from __future__ import annotations

import httpx
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config import settings

logger = structlog.get_logger(__name__)
router = APIRouter()

_SYSTEM = (
    "You are a prompt engineer for a spoken role-play training app. The user gives a rough idea "
    "of who they want to talk to and what they want to practise. Rewrite it into a single, high-quality "
    "system prompt that makes an AI a believable, engaging role-play PARTNER (not a narrator). "
    "The rewritten prompt must: define the character and their goals/personality; describe the scene; "
    "instruct the AI to stay in character, speak in short natural turns, react realistically, and "
    "challenge the learner appropriately; and never reveal it is an AI. "
    "Output ONLY the rewritten system prompt text — no preamble, no quotes, no markdown headers."
)


class ImproveRequest(BaseModel):
    prompt: str
    context: str | None = None


@router.post("/improve")
async def improve_prompt(body: ImproveRequest):
    raw = (body.prompt or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not settings.gemini_prompt_api_key:
        raise HTTPException(status_code=503, detail="prompt redesign is not configured")

    user_text = raw[:4000]
    if body.context:
        user_text = f"Context: {body.context[:1000]}\n\nUser idea:\n{user_text}"

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_prompt_model}:generateContent?key={settings.gemini_prompt_api_key}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {"temperature": 0.6, "maxOutputTokens": 700},
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        improved = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as exc:  # noqa: BLE001
        logger.error("prompt.improve_failed", error=str(exc))
        raise HTTPException(status_code=502, detail="Could not improve the prompt") from exc

    return {"improved": improved}
