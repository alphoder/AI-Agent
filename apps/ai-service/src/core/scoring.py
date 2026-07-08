"""Post-session scoring — Gemini Flash evaluates the transcript against the
rubric and the accumulated body-language notes."""
from __future__ import annotations

from datetime import datetime
import json

import httpx
import structlog

from src.config import settings

logger = structlog.get_logger(__name__)

EVALUATION_SYSTEM_PROMPT = """You are an expert INSURANCE SALES coach (BFSI, India) evaluating a practice sales call.
The learner is the insurance agent; the AI character played the customer/prospect. You are given the
conversation transcript (with relative timestamps in [MM:SS] format), a scoring rubric, the character context, the scenario objective, and real-time
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
  then ask about dependants before mentioning premium"), referencing the exact timestamps (e.g. "[01:12]") where the moment happened.

Respond with VALID JSON ONLY — no markdown, no code fences, no commentary. Schema:
{
  "criteria_scores": [
    {"criterion_name": "<rubric criterion>", "score": <integer 1-5>, "weight": <weight from rubric>, "justification": "<2-3 sentences referencing specific timestamps [MM:SS]>"}
  ],
  "strengths": ["<s1 with timestamp reference>", "<s2 with timestamp reference>", "<s3 with timestamp reference>"],
  "improvements": ["<i1 with timestamp reference>", "<i2 with timestamp reference>", "<i3 with timestamp reference>"],
  "narrative_feedback": "<CONVERSATIONAL ANALYTICS DASHBOARD, followed by 2-3 paragraphs of specific, actionable feedback>",
  "body_language_score": <number 0-100, or null if no observations were provided>,
  "body_language_feedback": "<2-3 sentences on posture, eye contact, gestures, expression and engagement; or note the camera was off if no observations>"
}

Rules:
- Exactly one criteria_scores entry per rubric criterion; score is an integer 1-5.
- Exactly 3 strengths and 3 improvements, each referencing at least one timestamp [MM:SS] from the transcript.
- Every criterion justification MUST reference at least one timestamp [MM:SS] to justify the score.
- In "narrative_feedback", you MUST prepend a neat, structured text-based CONVERSATIONAL ANALYTICS DASHBOARD before the paragraphs. Format it exactly like this:
### 📊 CONVERSATIONAL ANALYTICS
- **Talk-to-Listen Ratio:** <learner word count / total word count in %> Learner / <avatar word count / total word count in %> Avatar (ideal learner ratio is 35%-45% in discovery)
- **Question Frequency:** <count of total questions asked by learner> questions asked (<count> open-ended, <count> closed-ended)
- **Filler Word Usage:** <count> filler words detected (e.g., "um", "uh", "like", "you know")
- **Ethical Compliance Flag:** <"✅ PASSED (No mis-selling, deceptive claims, or omission of exclusions/waiting periods)" OR "⚠️ WARNING / VIOLATION (Highlight specific mis-selling/guaranteed return promises made at [MM:SS])">

- Base body_language_score and feedback ONLY on the provided observations; if the list is empty or the camera was disabled/not allowed, set the score to null and set the feedback to "Webcam was disabled or not allowed during the session."
"""


def _format_transcript(transcript: list[dict]) -> str:
    if not transcript:
        return "(Empty transcript)"

    start_time = None
    formatted_lines = []

    for t in transcript:
        role = t.get("role", "?")
        content = t.get("content", "")
        created_at_raw = t.get("created_at")

        timestamp_str = ""
        if created_at_raw:
            try:
                # Handle potential datetime object or ISO string
                if isinstance(created_at_raw, str):
                    clean_ts = created_at_raw
                    if clean_ts.endswith("Z"):
                        clean_ts = clean_ts[:-1] + "+00:00"
                    clean_ts = clean_ts.replace(" ", "T")
                    dt = datetime.fromisoformat(clean_ts)
                else:
                    dt = created_at_raw

                if start_time is None:
                    start_time = dt

                elapsed_sec = int((dt - start_time).total_seconds())
                mm = elapsed_sec // 60
                ss = elapsed_sec % 60
                timestamp_str = f"[{mm:02d}:{ss:02d}] "
            except Exception:
                pass

        formatted_lines.append(f"{timestamp_str}{role}: {content}")

    return "\n".join(formatted_lines)


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


BEGINNER_RUBRIC = [
    {
        "name": "Professional Opening & Greeting",
        "description": "Opens professionally, sets a polite tone, identifies self and company, and asks permission to speak.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Abrupt, rude, or fails to introduce self/company."},
            {"score": 3, "description": "Polite introduction, but feels scripted or misses permission check."},
            {"score": 5, "description": "Warm, professional opening that establishes immediate credibility."}
        ]
    },
    {
        "name": "Fact Accuracy & Compliance",
        "description": "Explains product facts correctly and adheres to compliance standards (no false promises or hidden terms).",
        "weight": 30,
        "levels": [
            {"score": 1, "description": "Makes deceptive claims, guarantees high yields, or hides waiting periods/costs."},
            {"score": 3, "description": "Mostly accurate, but fails to explain key exclusions or features clearly."},
            {"score": 5, "description": "Completely accurate, transparent, and compliant throughout the explanation."}
        ]
    },
    {
        "name": "Simple Information Gathering",
        "description": "Asks basic, relevant qualification questions to gather essential details.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Asks no questions; jumps straight into a feature pitch."},
            {"score": 3, "description": "Asks 1-2 basic questions, but fails to gather a clean picture."},
            {"score": 5, "description": "Efficiently asks relevant qualification questions to understand basics."}
        ]
    },
    {
        "name": "Clean Hand-off / Next Step",
        "description": "Proposes a polite, simple next step (e.g. sending a document or a callback).",
        "weight": 20,
        "levels": [
            {"score": 1, "description": "No closing attempt, or highly aggressive pressure close."},
            {"score": 3, "description": "Vague closing attempt with no specific time or commitment."},
            {"score": 5, "description": "Secures a polite, specific, non-threatening next action."}
        ]
    }
]

INTERMEDIATE_RUBRIC = [
    {
        "name": "Active Needs Discovery",
        "description": "Asks open-ended questions to qualify the customer's specific needs, situation, and goals.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Jumps straight to pitch without any needs discovery questions."},
            {"score": 3, "description": "Asks basic questions but fails to probe deeper into the responses."},
            {"score": 5, "description": "Asks strategic open-ended questions to map out the customer's needs."}
        ]
    },
    {
        "name": "Customized Solution Framing",
        "description": "Tailors the product benefits directly to the customer's stated goals and family/business setup.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Features dump. No correlation with the customer's situation."},
            {"score": 3, "description": "Explains benefits, but does not customize them to the customer's answers."},
            {"score": 5, "description": "Frames the product as the direct answer to the customer's self-identified need."}
        ]
    },
    {
        "name": "Standard Objection Handling",
        "description": "Validates objections (like price or delay) with empathy and responds with composed value arguments.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Arguing, defensive, or folds immediately at the first objection."},
            {"score": 3, "description": "Stays calm but responds with a scripted counter-pitch that feels rigid."},
            {"score": 5, "description": "Empathetically validates the concern, then uses value justification to resolve it."}
        ]
    },
    {
        "name": "Committed Action Close",
        "description": "Secures a firm next step with clear accountability and schedule (e.g., meeting, payment link).",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Fails to close, or leaves it open-ended ('think about it')."},
            {"score": 3, "description": "Asks for a next step but accepts a tentative, non-committal response."},
            {"score": 5, "description": "Secures a firm, agreed commitment for the next action."}
        ]
    }
]

ADVANCED_RUBRIC = [
    {
        "name": "Conversational Intelligence",
        "description": "Reads emotional cues, tone shifts, and subtext; adjusts conversation flow and mirrors the customer.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Robotic flow, script-bound, completely ignores customer's hints or mood."},
            {"score": 3, "description": "Keeps conversational flow but misses emotional shifts or subtle cues."},
            {"score": 5, "description": "Dynamic, mirrors energy, reads unstated doubts, and creates trusted flow."}
        ]
    },
    {
        "name": "Emotional Value Mapping",
        "description": "Uncovers deep, latent motivations and connects the solution to safety, legacy, or business continuity.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Talks only about product stats (IDV, premium, critical list) without emotional hooks."},
            {"score": 3, "description": "Touches on family or business protection but keeps it high-level."},
            {"score": 5, "description": "Maps the protection directly to the customer's deep emotional drivers."}
        ]
    },
    {
        "name": "Strategic Objection Reframing",
        "description": "Welcomes objections and uses customer's arguments to reinforce the value of immediate protection.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "Defensive or ignores objection; repeats the standard pitch."},
            {"score": 3, "description": "Validates, but is unable to pivot the objection into a positive selling point."},
            {"score": 5, "description": "Uses conversational Aikido; reframes the objection as the very reason to secure the plan."}
        ]
    },
    {
        "name": "Ethical Value Close",
        "description": "Earns the right to close through consultative trust, presenting clear choices with zero high-pressure tactics.",
        "weight": 25,
        "levels": [
            {"score": 1, "description": "High-pressure close, false urgency, or completely avoids asking for commitment."},
            {"score": 3, "description": "Puts forward the proposal but lacks confidence in asking for commitment."},
            {"score": 5, "description": "Natural close that feels like a service; customer is glad they were asked."}
        ]
    }
]


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
        difficulty_level: str = "intermediate",
    ) -> dict:
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        actual_rubric = rubric
        if not actual_rubric:
            diff = difficulty_level.lower()
            if diff == "beginner":
                actual_rubric = BEGINNER_RUBRIC
            elif diff == "advanced":
                actual_rubric = ADVANCED_RUBRIC
            else:
                actual_rubric = INTERMEDIATE_RUBRIC

        user_prompt = (
            f"## Scenario Objective\n{scenario_objective}\n\n"
            f"## Character Context\n{persona_context}\n\n"
            f"## Scoring Rubric\n{_format_rubric(actual_rubric)}\n\n"
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
        # Normalise by the ACTUAL total weight, not a hardcoded 100 — so the 0-100
        # score is correct even if the rubric's weights don't sum to 100 or the model
        # returns fractional weights (e.g. 0.33 instead of 33, which otherwise yields
        # a nonsensical ~0.4 instead of ~40).
        total_weight = sum((c.get("weight", 0) or 0) for c in criteria_scores)
        if total_weight > 0:
            overall_score = round(
                sum((c.get("score", 0) / 5.0) * (c.get("weight", 0) or 0) for c in criteria_scores)
                / total_weight * 100.0,
                1,
            )
        else:
            # Model omitted weights entirely — fall back to an equal-weight average.
            scores = [c.get("score", 0) for c in criteria_scores]
            overall_score = round(sum(scores) / len(scores) / 5.0 * 100.0, 1) if scores else 0.0

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
