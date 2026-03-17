"""Tests for the scoring engine module."""

import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.scoring import ScoringEngine, _format_transcript, _format_rubric


@pytest.fixture
def scoring_engine():
    """Create a ScoringEngine with a mock API key."""
    with patch("src.core.scoring.AsyncOpenAI"):
        engine = ScoringEngine(api_key="test-key", model="gpt-4o")
    return engine


def _make_openai_response(result_dict: dict) -> MagicMock:
    """Create a mock OpenAI chat completion response."""
    mock_message = MagicMock()
    mock_message.content = json.dumps(result_dict)
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    return mock_response


VALID_EVAL_RESULT = {
    "criteria_scores": [
        {"criterion_name": "Empathy", "score": 4, "weight": 40, "justification": "Good empathy shown."},
        {"criterion_name": "Problem Solving", "score": 5, "weight": 60, "justification": "Excellent resolution."},
    ],
    "strengths": ["Good listening", "Clear communication", "Professional tone"],
    "improvements": ["Could ask more questions", "Faster resolution", "More follow-up"],
    "narrative_feedback": "Overall excellent performance in handling the customer interaction.",
}


class TestWeightedScore:
    """Tests for weighted score calculation."""

    @pytest.mark.asyncio
    async def test_weighted_score_calculation(
        self, scoring_engine, sample_transcript, sample_rubric
    ):
        """Overall score should be calculated as sum(score/5 * weight/100) * 100."""
        scoring_engine.client.chat.completions.create = AsyncMock(
            return_value=_make_openai_response(VALID_EVAL_RESULT)
        )

        result = await scoring_engine.evaluate(
            transcript=sample_transcript,
            rubric=sample_rubric,
            persona_context="Friendly customer service rep",
            scenario_objective="Handle a product return",
        )

        # Expected: (4/5 * 40/100 + 5/5 * 60/100) * 100 = (0.32 + 0.60) * 100 = 92.0
        assert result["overall_score"] == 92.0


class TestEvaluateReturnStructure:
    """Tests for evaluate method return structure."""

    @pytest.mark.asyncio
    async def test_evaluate_returns_correct_keys(
        self, scoring_engine, sample_transcript, sample_rubric
    ):
        """Result should contain all required keys."""
        scoring_engine.client.chat.completions.create = AsyncMock(
            return_value=_make_openai_response(VALID_EVAL_RESULT)
        )

        result = await scoring_engine.evaluate(
            transcript=sample_transcript,
            rubric=sample_rubric,
            persona_context="Test persona",
            scenario_objective="Test objective",
        )

        assert "overall_score" in result
        assert "criteria_scores" in result
        assert "strengths" in result
        assert "improvements" in result
        assert "narrative_feedback" in result
        assert "scored_by_model" in result

    @pytest.mark.asyncio
    async def test_scored_by_model_matches_engine_model(
        self, scoring_engine, sample_transcript, sample_rubric
    ):
        """scored_by_model should match the model configured on the engine."""
        scoring_engine.client.chat.completions.create = AsyncMock(
            return_value=_make_openai_response(VALID_EVAL_RESULT)
        )

        result = await scoring_engine.evaluate(
            transcript=sample_transcript,
            rubric=sample_rubric,
            persona_context="Test persona",
            scenario_objective="Test objective",
        )

        assert result["scored_by_model"] == "gpt-4o"


class TestRetryBehavior:
    """Tests for retry logic on API failures."""

    @pytest.mark.asyncio
    async def test_retry_on_first_failure(
        self, scoring_engine, sample_transcript, sample_rubric
    ):
        """Should succeed on second attempt after first failure."""
        scoring_engine.client.chat.completions.create = AsyncMock(
            side_effect=[
                Exception("API error"),
                _make_openai_response(VALID_EVAL_RESULT),
            ]
        )

        result = await scoring_engine.evaluate(
            transcript=sample_transcript,
            rubric=sample_rubric,
            persona_context="Test persona",
            scenario_objective="Test objective",
        )

        assert result["overall_score"] == 92.0
        assert scoring_engine.client.chat.completions.create.call_count == 2

    @pytest.mark.asyncio
    async def test_raises_runtime_error_after_two_failures(
        self, scoring_engine, sample_transcript, sample_rubric
    ):
        """Should raise RuntimeError after 2 consecutive failures."""
        scoring_engine.client.chat.completions.create = AsyncMock(
            side_effect=[
                Exception("First failure"),
                Exception("Second failure"),
            ]
        )

        with pytest.raises(RuntimeError, match="Scoring evaluation failed after 2 attempts"):
            await scoring_engine.evaluate(
                transcript=sample_transcript,
                rubric=sample_rubric,
                persona_context="Test persona",
                scenario_objective="Test objective",
            )


class TestPromptConstruction:
    """Tests for prompt assembly in evaluate."""

    @pytest.mark.asyncio
    async def test_prompt_includes_all_components(
        self, scoring_engine, sample_transcript, sample_rubric
    ):
        """User prompt should include transcript, rubric, persona context, and scenario objective."""
        scoring_engine.client.chat.completions.create = AsyncMock(
            return_value=_make_openai_response(VALID_EVAL_RESULT)
        )

        await scoring_engine.evaluate(
            transcript=sample_transcript,
            rubric=sample_rubric,
            persona_context="Friendly customer service representative",
            scenario_objective="Handle a product return gracefully",
        )

        call_args = scoring_engine.client.chat.completions.create.call_args
        messages = call_args.kwargs["messages"]

        # System prompt should be the evaluation prompt
        assert messages[0]["role"] == "system"

        # User prompt should contain all components
        user_content = messages[1]["content"]
        assert "Handle a product return gracefully" in user_content
        assert "Friendly customer service representative" in user_content
        assert "Empathy" in user_content  # From rubric
        assert "product return" in user_content  # From transcript


class TestHelperFunctions:
    """Tests for _format_transcript and _format_rubric helpers."""

    def test_format_transcript(self, sample_transcript):
        """Should format transcript as 'role: content' lines."""
        result = _format_transcript(sample_transcript)
        assert "user: Hi" in result
        assert "avatar: Of course!" in result

    def test_format_rubric(self, sample_rubric):
        """Should format rubric with criteria names, weights, and levels."""
        result = _format_rubric(sample_rubric)
        assert "Empathy" in result
        assert "Weight: 40%" in result
        assert "Problem Solving" in result
        assert "Score 1:" in result
        assert "Score 5:" in result
