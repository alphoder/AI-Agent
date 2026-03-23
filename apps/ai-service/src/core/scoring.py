"""Post-session scoring engine.

Evaluates completed sessions using GPT-4o against the scenario rubric.
"""
from __future__ import annotations

import json

import structlog
from openai import AsyncOpenAI

logger = structlog.get_logger(__name__)

EVALUATION_SYSTEM_PROMPT = """You are an expert evaluator for professional training simulations.
You will be given a conversation transcript between a learner and an AI persona,
along with a scoring rubric, persona context, and the scenario objective.

Evaluate the learner's performance strictly against the rubric criteria provided.

You MUST respond with valid JSON only — no markdown, no code fences, no commentary outside the JSON.

The JSON schema you must follow:
{
  "criteria_scores": [
    {
      "criterion_name": "<name of the rubric criterion>",
      "score": <integer 1-5>,
      "weight": <weight from the rubric>,
      "justification": "<2-3 sentence justification for this score>"
    }
  ],
  "strengths": [
    "<strength 1>",
    "<strength 2>",
    "<strength 3>"
  ],
  "improvements": [
    "<area for improvement 1>",
    "<area for improvement 2>",
    "<area for improvement 3>"
  ],
  "narrative_feedback": "<2-3 paragraph narrative feedback summarizing overall performance, key moments, and actionable next steps>"
}

Rules:
- Provide exactly one entry in criteria_scores for each rubric criterion.
- Each score must be an integer from 1 to 5 inclusive.
- Provide exactly 3 strengths and exactly 3 areas for improvement.
- The narrative_feedback should be 2-3 paragraphs.
- Be specific — reference actual moments from the transcript in your justifications and feedback.
"""


def _format_transcript(transcript: list[dict]) -> str:
    """Format transcript entries as 'role: content' lines."""
    lines = []
    for turn in transcript:
        role = turn.get("role", "unknown")
        content = turn.get("content", "")
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _format_rubric(rubric: list[dict]) -> str:
    """Format rubric criteria into a readable block for the prompt."""
    parts = []
    for i, criterion in enumerate(rubric, 1):
        name = criterion.get("name", f"Criterion {i}")
        description = criterion.get("description", "")
        weight = criterion.get("weight", 0)
        header = f"Criterion {i}: {name} (Weight: {weight}%)\nDescription: {description}"

        levels = criterion.get("levels", [])
        if levels:
            level_lines = []
            for level in sorted(levels, key=lambda l: l.get("score", 0)):
                score = level.get("score", "?")
                desc = level.get("description", "")
                level_lines.append(f"  Score {score}: {desc}")
            header += "\nScoring Levels:\n" + "\n".join(level_lines)

        parts.append(header)
    return "\n\n".join(parts)


class ScoringEngine:
    """Evaluate training sessions against rubric criteria."""

    def __init__(self, api_key: str, model: str = "gpt-4o"):
        # GROQ_SWAP: Use Groq for scoring when configured
        from src.config import settings
        if settings.llm_provider == "groq" and settings.groq_api_key:
            self.api_key = settings.groq_api_key
            self.model = settings.groq_model
            self._base_url = "https://api.groq.com/openai/v1"
        else:
            self.api_key = api_key
            self.model = model
            self._base_url = None
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            # GROQ_SWAP: Route to Groq or OpenAI based on config
            if self._base_url:
                self._client = AsyncOpenAI(api_key=self.api_key, base_url=self._base_url)
            else:
                self._client = AsyncOpenAI(api_key=self.api_key)
        return self._client

    async def evaluate(
        self,
        transcript: list[dict],
        rubric: list[dict],
        persona_context: str,
        scenario_objective: str,
    ) -> dict:
        """Evaluate a session transcript against the scoring rubric.

        Returns:
            dict with overall_score, criteria_scores, strengths,
            improvements, narrative_feedback, scored_by_model
        """
        logger.info(
            "scoring_evaluate_start",
            model=self.model,
            rubric_criteria=len(rubric),
        )

        user_prompt = (
            f"## Scenario Objective\n{scenario_objective}\n\n"
            f"## Persona Context\n{persona_context}\n\n"
            f"## Scoring Rubric\n{_format_rubric(rubric)}\n\n"
            f"## Conversation Transcript\n{_format_transcript(transcript)}"
        )

        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": EVALUATION_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.3,
                )
                raw = response.choices[0].message.content
                result = json.loads(raw)
                break
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "scoring_evaluate_attempt_failed",
                    attempt=attempt + 1,
                    error=str(exc),
                )
                if attempt == 1:
                    raise RuntimeError(
                        f"Scoring evaluation failed after 2 attempts: {last_error}"
                    ) from last_error

        # Calculate weighted overall score: sum(score/5 * weight/100) * 100
        criteria_scores = result.get("criteria_scores", [])
        overall_score = sum(
            (entry.get("score", 0) / 5.0) * (entry.get("weight", 0) / 100.0)
            for entry in criteria_scores
        ) * 100.0

        # Round to one decimal place
        overall_score = round(overall_score, 1)

        final = {
            "overall_score": overall_score,
            "criteria_scores": criteria_scores,
            "strengths": result.get("strengths", []),
            "improvements": result.get("improvements", []),
            "narrative_feedback": result.get("narrative_feedback", ""),
            "scored_by_model": self.model,
        }

        logger.info(
            "scoring_evaluate_complete",
            model=self.model,
            rubric_criteria=len(rubric),
            overall_score=overall_score,
        )

        return final
