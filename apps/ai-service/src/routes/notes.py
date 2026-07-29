"""AI notes — turn a learner's own scribbles plus the source material into a clean note.

Runs on Gemini Flash Lite. Internal-key protected; the gateway has already
ownership-checked everything it sends here and charges the learner 2 tokens.
"""
from __future__ import annotations

import re

import httpx
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config import settings

logger = structlog.get_logger(__name__)
router = APIRouter()

_SYSTEM = """You write the notes a learner would have written if they had had time.

You are given: what they were working on, whatever they jotted down themselves
(a call transcript may carry [MM:SS] markers where they flagged a moment), and
the source material.

Write ONE note, in plain text, for THEM to re-read later:
- Open with a single sentence naming what this was about.
- Then 3 to 6 short bullet lines starting with "- ".
- If they flagged moments with [MM:SS], keep those timestamps on the matching
  lines: those are the moments they wanted to remember. NEVER write a timestamp
  that was not given to you. Inventing one puts a false memory in their notes.
- If this is a call, say what actually worked and what to do differently, quoting
  their own words where it helps. Be specific to THIS conversation, never generic
  sales advice.
- Address them as "you". No headings, no markdown bold, no preamble like
  "Here are your notes". No em-dashes.
- Under 180 words.

Return the note text only."""


class NotesRequest(BaseModel):
    subject: str = ""
    kind: str = "page"           # module | session | page
    material: str = ""           # transcript or scenario brief
    my_notes: str = ""           # the learner's own notes and markers


@router.post("/summarise")
async def summarise(body: NotesRequest):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="AI notes are not configured")
    if not body.material.strip() and not body.my_notes.strip():
        raise HTTPException(status_code=400, detail="nothing to summarise")

    parts = [f"WORKING ON: {body.subject[:200]}", f"KIND: {body.kind}"]
    if body.my_notes.strip():
        parts.append(f"THEIR OWN NOTES AND FLAGGED MOMENTS:\n{body.my_notes[:4000]}")
    if body.material.strip():
        label = "CALL TRANSCRIPT" if body.kind == "session" else "SOURCE MATERIAL"
        parts.append(f"{label}:\n{body.material[:12000]}")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_flash_model}:generateContent?key={settings.gemini_api_key}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": "\n\n".join(parts)}]}],
        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 600},
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        chunks = data["candidates"][0]["content"]["parts"]
        note = "".join(p.get("text", "") for p in chunks).strip()
        # The model is told not to use em-dashes; enforce it rather than trust it.
        note = note.replace("—", ", ").replace("–", "-")
        note = _strip_invented_stamps(note, body.my_notes)
        if not note:
            raise ValueError("empty note")
        return {"note": note[:4000]}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("notes.failed", error=_safe(exc))
        raise HTTPException(status_code=502, detail="AI notes failed") from exc


_STAMP = re.compile(r"\[(\d{1,2}:\d{2})\]")


def _strip_invented_stamps(note: str, my_notes: str) -> str:
    """Remove any [MM:SS] the learner did not actually flag.

    Observed in testing: given notes with no markers at all, the model still
    wrote "[02:15] this is where you noticed...". A fabricated timestamp reads
    as a real memory, so only stamps present in their own notes survive.
    """
    def secs(stamp: str) -> int:
        m, s = stamp.split(":")
        return int(m) * 60 + int(s)

    # Compare by value, not text: the gateway writes "1:30" and the model often
    # normalises it to "01:30". A string compare would strip a real marker.
    real = {secs(t) for t in _STAMP.findall(my_notes or "")}
    if not _STAMP.search(note):
        return note
    cleaned = _STAMP.sub(lambda m: m.group(0) if secs(m.group(1)) in real else "", note)
    # A removed stamp leaves a double space behind; collapse only those.
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


def _safe(exc: Exception) -> str:
    """Our request URL carries ?key=; never let it reach a log line."""
    return re.sub(r"key=[A-Za-z0-9_\-]+", "key=REDACTED", str(exc))
