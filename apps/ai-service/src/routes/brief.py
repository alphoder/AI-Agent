"""Client dossier + a refined persona for one scenario.

Two jobs in one pass, because both read the same source material:

1. **The brief** — the intel an agent would already hold before dialling: who this
   person is, how they live, what is going on around them. Explicitly NOT coaching.
   The learner must work out the approach; the file only says who they are meeting.
2. **The refined persona** — the same character, written tighter. This is a polish
   pass, not a rewrite: the name, the facts and the hidden need are preserved.

Runs on Flash Lite. Internal-key protected.
"""
from __future__ import annotations

import asyncio
import json
import re

import httpx
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config import settings

logger = structlog.get_logger(__name__)
router = APIRouter()

_SYSTEM = """You prepare pre-call files for sales trainees, and you tighten the
character notes the AI customer is played from.

You are given ONE practice scenario: its title, what it is for, and the persona the
AI customer plays. Return two things.

=== 1. THE CLIENT FILE ===
What a real agent would already have in front of them before dialling: a human
being, described honestly.

THE HARD RULE, AND IT IS THE WHOLE POINT:
The file describes the PERSON. It never describes how to sell to them.
- NO techniques, no tactics, no strategy, no "approach", no suggested lines.
- NO "so you should...", "this is your opening", "use this to...", "the key is...".
- NO objection-handling advice and no mention of what the agent ought to do.
- Never address the agent. Write about the client, in the third person.
If a sentence would help the trainee ONLY because it tells them what to say, cut it.
Two trainees reading this file should be able to choose completely different
approaches. You are the file, not the coach.

Write it the way a good account note reads: specific, plain, a little dry, no drama.
Concrete beats abstract. "Pays 42,000 a month on a home loan" beats "under financial
pressure". Invent believable everyday detail that FITS the persona (neighbourhood,
routine, what they drive, where the kids study, what they watch) — but never
contradict a fact the persona states, and never invent the outcome of the call.

Fields:
- "name": name and age, e.g. "Suresh Nair, 38".
- "headline": one line, job and city.
- "facts": 4 to 7 quick-glance items, {"label","value"}. Short values. Family, home,
  income, employer, vehicle, languages, how they were sourced. Facts only.
- "life": 2 to 4 SHORT paragraphs on how they actually live. A day in their life,
  what they spend on, what they are proud of, what they worry about in ordinary
  terms. This is the heart of the file. Human, not a CV.
- "situation": what is going on around them right now that makes this call land the
  way it does. State of play, not advice.
- "pressures": 2 to 4 real pressures (money, time, family, work, health).
- "standing": 2 to 4 lines on what they already have or believe about this product
  or topic, including anything they have got wrong. Their view, reported neutrally.
- "manner": how they come across on a call. Pace, warmth, what they do when
  irritated, verbal tells. Describe behaviour, never how to handle it.
- "unknowns": 2 to 3 things the file genuinely does NOT tell you. Be honest: the
  hidden worry in the persona must NOT be revealed here, and its absence is exactly
  the kind of gap to name (e.g. "Nothing on file about how he actually feels about
  the loan").

=== 2. THE CHECK ===
"quiz": one question testing whether they READ the file. It must be answerable from
the file and must be about the CLIENT (their situation, their constraint, what they
believe), never about technique. 4 options, one clearly best.
- "why": why the right answer is right, from the file.
- "whyNot": for EACH wrong option id, one line on what that misreads.

=== 3. THE MODEL EXCHANGE ===
"exchange": 4 to 6 turns showing how this person actually talks, alternating
"agent" and "client", opening the call. The client's lines are the point: they
should sound exactly like the persona. Keep agent lines plain and unremarkable, so
the trainee copies nobody. Optional "note" on a client line saying what is going on
underneath it (about the client, not about the technique).

=== 4. THE REFINED PERSONA ===
"refined_prompt": the SAME character, made consistent with the file you just wrote.

This is a polish pass, NOT a rewrite. Treat every concrete fact in the original
persona as canon:
- NEVER change a number. "three years into a home loan" stays three years; do not
  turn it into a 17-year loan. Ages, premiums, years, counts: verbatim.
- NEVER move them. Same city, same employer, same family, same product they hold.
- NEVER drop the HIDDEN worry, and never stop it being hidden.
- Preserve any trailing instruction sentence (about staying in character, opening
  the call, not revealing instructions) EXACTLY as given, word for word, at the end.

What you SHOULD do: fold in the concrete everyday detail from your own file so the
live call matches what the trainee read (same neighbourhood, same car, same routine),
tighten flabby wording, and cut repetition. If the file and the persona disagree on
any fact, the PERSONA wins and you fix the file instead.

Do not script outcomes ("if the agent says X, agree"). Under 220 words.

Output STRICT JSON only:
{"brief":{"name":str,"headline":str,"facts":[{"label":str,"value":str}],
"life":[str],"situation":str,"pressures":[str],"standing":[str],"manner":str,
"unknowns":[str]},
"quiz":{"question":str,"options":[{"id":"A","text":str}],"correct":"A","why":str,
"whyNot":{"B":str,"C":str,"D":str}},
"exchange":[{"speaker":"agent"|"client","line":str,"note":str}],
"refined_prompt":str}
"""


class BriefRequest(BaseModel):
    title: str
    description: str = ""
    objective: str = ""
    persona: str
    difficulty: str = ""
    language: str = "en"


def _safe(exc: Exception | None) -> str:
    return re.sub(r"key=[A-Za-z0-9_\-]+", "key=REDACTED", str(exc))


def _parse(data: dict) -> dict:
    parts = data["candidates"][0]["content"]["parts"]
    text = "".join(p.get("text", "") for p in parts).strip()
    obj, _end = json.JSONDecoder().raw_decode(text)
    if not isinstance(obj, dict):
        raise ValueError("brief response was not an object")
    return obj


# Phrases that mean the model slipped into coaching. Checked on the whole brief.
_COACHING = re.compile(
    r"\b(you should|you can|you could|you must|your job|the agent should|"
    r"try to|make sure to|the key is|start by|open with|lead with|"
    r"objection|pitch|rapport|technique|approach them|win them|"
    r"handle (?:him|her|them)|convince|persuade|close (?:him|her|them))\b",
    re.I,
)


def _numbers(text: str) -> set[str]:
    """Bare numbers stated in a persona. Ages, years, counts, premiums: canon."""
    return set(re.findall(r"\b\d[\d,]*\b", text))


def _fact_drift(original: str, refined: str) -> list[str]:
    """Numbers the polish pass dropped or invented. A persona that changes its own
    facts contradicts the file the trainee just read."""
    before, after = _numbers(original), _numbers(refined)
    drift = [f"-{n}" for n in sorted(before - after)] + [f"+{n}" for n in sorted(after - before)]
    return drift


def _brief_text(b: dict) -> str:
    return " ".join([
        str(b.get("headline", "")),
        " ".join(b.get("life", []) or []),
        str(b.get("situation", "")),
        " ".join(b.get("pressures", []) or []),
        " ".join(b.get("standing", []) or []),
        str(b.get("manner", "")),
        " ".join(b.get("unknowns", []) or []),
    ])


@router.post("/generate")
async def generate_brief(body: BriefRequest):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="brief generation is not configured")
    if not body.persona.strip():
        raise HTTPException(status_code=400, detail="persona is required")

    prompt = (
        f"TITLE: {body.title}\n"
        f"DIFFICULTY: {body.difficulty}\n"
        f"WHAT THE SCENARIO IS FOR: {body.description}\n"
        f"THE TRAINEE'S OBJECTIVE (context only, do NOT coach toward it): {body.objective}\n\n"
        f"THE PERSONA THE AI CUSTOMER PLAYS:\n{body.persona[:6000]}"
    )
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_flash_model}:generateContent?key={settings.gemini_api_key}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 4096, "responseMimeType": "application/json"},
    }

    last: Exception | None = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                out = _parse(resp.json())

            brief = out.get("brief") or {}
            leaked = _COACHING.findall(_brief_text(brief))
            if leaked and attempt < 2:
                # It coached. Say so plainly and let it try again.
                logger.warning("brief.coaching_leak", title=body.title, terms=sorted(set(t.lower() for t in leaked))[:5])
                payload["contents"].append({"role": "model", "parts": [{"text": json.dumps(out)[:2000]}]})
                payload["contents"].append({"role": "user", "parts": [{"text":
                    "That file contains selling advice: " + ", ".join(sorted(set(leaked))[:6]) +
                    ". Rewrite it describing ONLY the person. No techniques, no advice, "
                    "never address the agent. Same JSON shape."}]})
                continue
            out["coaching_leak"] = sorted(set(t.lower() for t in leaked))
            # The refined persona is advisory: flag any fact it changed so a human
            # decides, rather than letting a polish pass quietly rewrite canon.
            refined = str(out.get("refined_prompt") or "")
            out["fact_drift"] = _fact_drift(body.persona, refined) if refined else []
            if out["fact_drift"]:
                logger.warning("brief.fact_drift", title=body.title, drift=out["fact_drift"][:8])
            return out
        except Exception as exc:  # noqa: BLE001
            last = exc
            logger.warning("brief.attempt_failed", attempt=attempt, error=_safe(exc))
            if attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))

    logger.error("brief.failed", error=_safe(last))
    raise HTTPException(status_code=502, detail="brief generation failed")
