"""Personalised journey plan — turns the My Journey intake into a week of practice.

The journey is built ONE WEEK AT A TIME. Week 1 comes from the questionnaire;
finishing a week generates the next one, and the gateway has already removed
everything the learner has mastered from the catalogue it sends. So this route
never has to know what came before — the shortlist IS the memory.

Runs on Gemini Flash Lite. Internal-key protected (called by the API gateway,
which supplies the scenario catalogue and validates every id we return).

We deliberately return only scenario IDS the caller gave us; the gateway
re-checks them against the database before persisting, because a model that
invents a plausible UUID must never put an unreachable task in someone's plan.
"""
from __future__ import annotations

import asyncio
import json
import re

import httpx
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config import settings

logger = structlog.get_logger(__name__)
router = APIRouter()

_MAX_DAYS = 7
_MAX_TASKS = 3

_SYSTEM = """You build ONE WEEK of a personalised speaking-practice roadmap for ONE learner.

You are given the learner's intake answers and a CATALOGUE of practice scenarios
that has already been filtered to this person: everything in it suits their role
and goals, and anything they have already mastered has been removed. Use it.

This is WEEK {week} of their journey. Produce {days} days that take this specific
person forward from where they are now.

HARD RULES
- Use ONLY scenarioId values that appear in the catalogue. Never invent an id.
- Never repeat the same scenarioId AND type on the same day (a module plus a call
  for the same scenario on one day is correct and encouraged).
- Plan exactly {days} days, numbered 1 to {days} — one week, not a whole course.
- FILL THE DAY. They gave you {minutes} minutes a day. Keep adding tasks until the
  day's total is close to that budget, up to {max_tasks} tasks (module about 6 min,
  call about 8 min, drill about 3 min, review about 5 min). A 15-minute day with one
  6-minute task wastes most of their time and is wrong.
- LEARN THEN DO. A "module" task must be followed by a "call" task for the SAME
  scenarioId, on the same day if it fits the budget, otherwise the next day. Never
  leave a module without its call.
- DIFFICULTY RAMP. Every catalogue line carries "from day N". You may not place a
  scenario on a day earlier than its "from day" number. This is not a preference.
  It applies even when the scenario is the perfect topic match: pick an easier one
  that is legal for that day instead.
- Bias scenario choice towards the outcomes they picked and the moments they said
  go wrong. Their industry decides the flavour of customer they meet.
- Later days must revisit an earlier scenario as a "review" task at least twice,
  so the week consolidates instead of only moving forward. A "review" scenarioId
  must be one you already used on an earlier day OF THIS WEEK, or one listed under
  UNFINISHED below.
- UNFINISHED BUSINESS. If the prompt lists scenarios they scored badly on, put at
  least one of them in the first three days as a "review". They did not get it
  last week; the point of this week is that they do.
- A WEEK HAS A SHAPE. Days 1 to 2 rebuild confidence on something they can win,
  days 3 to 5 are the real work of their stated goal, days 6 to 7 stretch them and
  consolidate. Do not scatter unrelated topics across seven days.

TASK TYPES
- "module": learn the technique behind a scenario before speaking it.
- "call": a live spoken call with the AI customer. This is the main event.
- "drill": a short typed drill. Good for a low-minute day or a warm-up.
- "review": repeat a scenario they have already been given, to raise the score.

WRITING
- "headline": one short line naming what THIS WEEK gets them, in their own terms.
  Max 12 words. No em-dashes. On week 2 and later it should read as a continuation,
  not as a fresh start.
- "focus": 2 to 5 words naming the day's theme.
- "why": one short sentence, addressed to the learner as "you", saying why THIS
  scenario is on THIS day for THEM. Max 18 words. No em-dashes.

Output STRICT JSON only, exactly this shape:
{{"headline": string, "days": [{{"day": number, "focus": string,
  "tasks": [{{"type": "module"|"call"|"drill"|"review", "scenarioId": string, "why": string}}]}}]}}
"""


class CatalogueItem(BaseModel):
    id: str
    title: str
    difficulty: str = ""
    tags: list[str] = Field(default_factory=list)
    summary: str = ""


class Unfinished(BaseModel):
    id: str
    title: str
    best: int = 0


class PlanRequest(BaseModel):
    intake: dict
    catalogue: list[CatalogueItem]
    days: int = 7
    week: int = 1
    learner_name: str = ""
    # Scenarios they have attempted and are still below bronze on. Empty in week 1.
    unfinished: list[Unfinished] = Field(default_factory=list)


# The day a difficulty tier unlocks, per intensity setting. A per-item "from day N"
# is far more reliable than a global ramp rule the model has to hold in its head.
UNLOCK_DAY: dict[str, dict[str, int]] = {
    "gentle": {"beginner": 1, "intermediate": 5, "advanced": 10},
    "balanced": {"beginner": 1, "intermediate": 3, "advanced": 7},
    "hard": {"beginner": 1, "intermediate": 1, "advanced": 3},
}


def unlock_day(intensity: str, difficulty: str) -> int:
    tiers = UNLOCK_DAY.get(intensity, UNLOCK_DAY["balanced"])
    return tiers.get((difficulty or "").lower(), 1)


def _catalogue_text(items: list[CatalogueItem], intensity: str, week: int = 1) -> str:
    """"from day N" is relative to THIS week: by week three, a scenario that
    unlocks on journey-day 10 is legal on day 1. The gateway enforces the same
    offset, so a model that ignores this loses the task rather than the ramp."""
    offset = (week - 1) * 7
    lines = []
    for c in items:
        tags = ", ".join(c.tags[:6])
        day = max(1, unlock_day(intensity, c.difficulty) - offset)
        lines.append(
            f"- {c.id} | {c.title[:90]} | {c.difficulty or 'unknown'} | from day {day} | {tags} | {c.summary[:120]}"
        )
    return "\n".join(lines)


@router.post("/generate")
async def generate_plan(body: PlanRequest):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="plan generation is not configured")
    if not body.catalogue:
        raise HTTPException(status_code=400, detail="catalogue is required")

    days = max(1, min(body.days, _MAX_DAYS))
    minutes = int(body.intake.get("minutesPerDay") or 15)
    intensity = str(body.intake.get("intensity") or "balanced")
    who = f"The learner's name is {body.learner_name}.\n" if body.learner_name else ""
    unfinished = ""
    if body.unfinished:
        rows = "\n".join(f"- {u.id} | {u.title[:90]} | scored {u.best}" for u in body.unfinished)
        unfinished = f"UNFINISHED (attempted, still weak — bring at least one back early):\n{rows}\n\n"
    prompt = (
        f"{who}This is week {body.week}.\n"
        f"INTAKE ANSWERS (JSON):\n{json.dumps(body.intake)[:3000]}\n\n"
        f"{unfinished}"
        f"CATALOGUE (id | title | difficulty | earliest day | tags | summary):\n{_catalogue_text(body.catalogue, intensity, body.week)[:26000]}"
    )

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_flash_model}:generateContent?key={settings.gemini_api_key}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM.format(days=days, max_tasks=_MAX_TASKS, minutes=minutes, week=body.week)}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        # Low temperature: this is a scheduling job, not a creative one.
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 8192, "responseMimeType": "application/json"},
    }

    last_error: Exception | None = None
    for attempt in range(3):  # Gemini 503s under load, and strict JSON sometimes has trailing text
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
            return _shape(_parse(data), days)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("plan.attempt_failed", attempt=attempt, error=_safe(exc))
            if attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))  # brief backoff; 503 is usually transient

    logger.error("plan.failed", error=_safe(last_error))
    raise HTTPException(status_code=502, detail="plan generation failed")


def _safe(exc: Exception | None) -> str:
    """httpx puts the full request URL in its errors, and ours carries ?key=.
    Never let an API key reach a log line."""
    return re.sub(r"key=[A-Za-z0-9_\-]+", "key=REDACTED", str(exc))


def _parse(data: dict) -> dict:
    """Read the model's JSON.

    Two things go wrong in practice: long answers arrive split across several
    `parts`, and the text occasionally carries trailing prose after the closing
    brace. Join every part, then decode only the first JSON value.
    """
    parts = data["candidates"][0]["content"]["parts"]
    text = "".join(p.get("text", "") for p in parts).strip()
    obj, _end = json.JSONDecoder().raw_decode(text)
    if not isinstance(obj, dict):
        raise ValueError("plan response was not an object")
    return obj


def _shape(out: dict, days: int) -> dict:
    """Trim the model's output to the contract. The gateway still validates ids."""
    shaped_days = []
    for i, d in enumerate(out.get("days", [])[:days], start=1):
        tasks = []
        # Keyed on (type, id): "learn the module then make the call" is the same
        # scenario twice in one day on purpose, and must survive.
        seen: set[tuple[str, str]] = set()
        for t in (d.get("tasks") or [])[:_MAX_TASKS]:
            sid = str(t.get("scenarioId", "")).strip()
            ttype = str(t.get("type", "call")).strip()
            if not sid or (ttype, sid) in seen or ttype not in ("module", "call", "drill", "review"):
                continue
            seen.add((ttype, sid))
            tasks.append({"type": ttype, "scenarioId": sid, "why": str(t.get("why", "")).strip()[:160]})
        if tasks:
            shaped_days.append({"day": i, "focus": str(d.get("focus", "")).strip()[:60], "tasks": tasks})
    return {"headline": str(out.get("headline", "")).strip()[:120], "days": shaped_days}
