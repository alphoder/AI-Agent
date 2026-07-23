"""Free text drill — the customer persona in text, with a one-line coach.

Runs on Gemini Flash Lite (key 1): effectively free, so drills are never metered.
Internal-key protected (called via the API gateway).
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
    "You run a FREE TEXT DRILL for a sales-training app. You play the CUSTOMER described below, "
    "in text, and you also act as a silent coach.\n\n"
    "CUSTOMER PERSONA:\n{persona}\n\n"
    "TECHNIQUE BEING DRILLED: {technique}\n\n"
    "Rules:\n"
    "- Reply as the customer would: short and natural (1-2 sentences), with realistic resistance. "
    "Judge the trainee's argument on its merits for your situation — no magic words.\n"
    "- Then give ONE coaching tip (max 20 words) about the trainee's LAST message, tied to the technique.\n"
    "- If the trainee has clearly demonstrated the technique well over the conversation, set done=true "
    "and make the tip a specific compliment.\n"
    'Output STRICT JSON only: {{"reply": string, "tip": string, "done": boolean}}'
)


class DrillMessage(BaseModel):
    role: str  # 'user' (trainee) | 'customer'
    text: str


class DrillRequest(BaseModel):
    persona: str
    technique: str = ""
    messages: list[DrillMessage] = []


@router.post("/turn")
async def drill_turn(body: DrillRequest):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="drill is not configured")
    if not body.persona.strip():
        raise HTTPException(status_code=400, detail="persona is required")

    contents = [
        {"role": "user" if m.role == "user" else "model", "parts": [{"text": m.text[:1000]}]}
        for m in body.messages[-16:]  # last 8 exchanges is plenty of context
    ]
    if not contents or contents[-1]["role"] != "user":
        raise HTTPException(status_code=400, detail="last message must be from the trainee")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_flash_model}:generateContent?key={settings.gemini_api_key}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM.format(persona=body.persona[:4000], technique=body.technique[:300])}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.8, "maxOutputTokens": 300, "responseMimeType": "application/json"},
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        out = json.loads(data["candidates"][0]["content"]["parts"][0]["text"])
        return {
            "reply": str(out.get("reply", "")).strip(),
            "tip": str(out.get("tip", "")).strip(),
            "done": bool(out.get("done", False)),
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("drill.failed", error=str(exc))
        raise HTTPException(status_code=502, detail="drill failed") from exc
