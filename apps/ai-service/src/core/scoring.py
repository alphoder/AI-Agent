"""Post-session scoring — Gemini Flash evaluates the transcript against the
rubric and the accumulated body-language notes."""
from __future__ import annotations

import json

import httpx
import structlog

from src.config import settings

logger = structlog.get_logger(__name__)

EVALUATION_SYSTEM_PROMPT = """You are an expert INSURANCE SALES coach (BFSI, India) evaluating a practice sales call.
The learner is the insurance agent; the AI character played the customer/prospect. You are given the
conversation transcript, a scoring rubric, the character context, the scenario objective, and real-time
body-language observations from the learner's webcam.

Evaluate the learner strictly against the rubric, and separately assess their non-verbal/body language.

Insurance-sales judgement to apply throughout:
- REWARD: warm rapport, needs discovery before pitching (family, income, existing cover), simple jargon-free
  explanations, empathetic and confident objection handling, and a clear ethical next step.
- PENALISE HARD: mis-selling or over-promising (e.g. "guaranteed 12% returns", hiding waiting periods,
  charges or exclusions), pushing a product before understanding the need, and pressuring the customer.
  Compliant, needs-based, honest selling must always score higher than a pushy "close at any cost".
- Judge in the scenario's language; do not penalise natural code-switching (e.g. Hinglish) if it aids clarity.
- Make every strength/improvement a concrete, coachable sales action ("open by acknowledging their time,
  then ask about dependants before mentioning premium"), not generic praise.

Respond with VALID JSON ONLY — no markdown, no code fences, no commentary. Schema:
{
  "criteria_scores": [
    {"criterion_name": "<rubric criterion>", "score": <integer 1-5>, "weight": <weight from rubric>, "justification": "<2-3 sentences>"}
  ],
  "strengths": ["<s1>", "<s2>", "<s3>"],
  "improvements": ["<i1>", "<i2>", "<i3>"],
  "narrative_feedback": "<2-3 paragraphs of specific, actionable feedback>",
  "body_language_score": <number 0-100, or null if no observations were provided>,
  "body_language_feedback": "<2-3 sentences on posture, eye contact, gestures, expression and engagement; or note the camera was off if no observations>"
}

Rules:
- Exactly one criteria_scores entry per rubric criterion; score is an integer 1-5.
- Exactly 3 strengths and 3 improvements.
- Reference actual moments from the transcript.
- Base body_language_score and feedback ONLY on the provided observations; if the list is empty, set the score to null.
"""


def _format_transcript(transcript: list[dict]) -> str:
    return "\n".join(f"{t.get('role', '?')}: {t.get('content', '')}" for t in transcript)


def _format_rubric(rubric: list[dict]) -> str:
    parts = []
    for i, c in enumerate(rubric, 1):
        header = f"Criterion {i}: {c.get('name', '')} (Weight: {c.get('weight', 0)}%)\nDescription: {c.get('description', '')}"
        levels = c.get("levels", [])
        if levels:
            lines = [f"  Score {l.get('score', '?')}: {l.get('description', '')}" for l in sorted(levels, key=lambda x: x.get("score", 0))]
            header += "\nLevels:\n" + "\n".join(lines)
        parts.append(header)
    return "\n\n".join(parts)


def _format_notes(notes: list[dict]) -> str:
    if not notes:
        return "(No body-language observations were captured — the camera may have been off.)"
    return "\n".join(f"- [{n.get('at', 0)}s] {n.get('note', '')}" for n in notes)


class ScoringEngine:
    """Evaluate a session with Gemini Flash."""

    def __init__(self, model: str | None = None):
        self.model = model or settings.gemini_flash_model

    async def evaluate(
        self,
        transcript: list[dict],
        rubric: list[dict],
        persona_context: str,
        scenario_objective: str,
        body_language_notes: list[dict] | None = None,
    ) -> dict:
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        user_prompt = (
            f"## Scenario Objective\n{scenario_objective}\n\n"
            f"## Character Context\n{persona_context}\n\n"
            f"## Scoring Rubric\n{_format_rubric(rubric)}\n\n"
            f"## Body-Language Observations\n{_format_notes(body_language_notes or [])}\n\n"
            f"## Conversation Transcript\n{_format_transcript(transcript)}"
        )

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={settings.gemini_api_key}"
        )
        payload = {
            "systemInstruction": {"parts": [{"text": EVALUATION_SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"},
        }

        last_error: Exception | None = None
        result: dict | None = None
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.post(url, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                raw = data["candidates"][0]["content"]["parts"][0]["text"]
                result = json.loads(raw)
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning("scoring.attempt_failed", attempt=attempt + 1, error=str(exc))
        if result is None:
            raise RuntimeError(f"Scoring failed after 2 attempts: {last_error}")

        criteria_scores = result.get("criteria_scores", [])
        overall_score = round(
            sum((c.get("score", 0) / 5.0) * (c.get("weight", 0) / 100.0) for c in criteria_scores) * 100.0,
            1,
        )

        return {
            "overall_score": overall_score,
            "criteria_scores": criteria_scores,
            "strengths": result.get("strengths", []),
            "improvements": result.get("improvements", []),
            "narrative_feedback": result.get("narrative_feedback", ""),
            "body_language_score": result.get("body_language_score"),
            "body_language_feedback": result.get("body_language_feedback", ""),
            "scored_by_model": self.model,
        }
