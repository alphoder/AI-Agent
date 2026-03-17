"""Tests for the LLM client module."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.llm import LLMClient, SENTENCE_END


@pytest.fixture
def llm_client():
    """Create an LLMClient with mocked settings."""
    with patch("src.core.llm.settings") as mock_settings, \
         patch("src.core.llm.openai.AsyncOpenAI") as mock_openai_cls:
        mock_settings.openai_api_key = "test-key"
        mock_settings.openai_model = "gpt-4o"
        client = LLMClient()
    return client


class TestAssemblePrompt:
    """Tests for the assemble_prompt method."""

    def test_includes_persona_prompt(self, llm_client):
        """Assembled prompt should start with the persona prompt."""
        result = llm_client.assemble_prompt(
            persona_prompt="You are a helpful sales trainer.",
            guardrails={"allowed_topics": []},
            scenario_context="",
            rag_context=None,
            blocked_topics=[],
        )
        assert result.startswith("You are a helpful sales trainer.")

    def test_includes_scenario_context(self, llm_client):
        """Assembled prompt should include scenario context when provided."""
        result = llm_client.assemble_prompt(
            persona_prompt="Persona",
            guardrails={"allowed_topics": []},
            scenario_context="The customer wants to return a defective product.",
            rag_context=None,
            blocked_topics=[],
        )
        assert "Scenario Context:" in result
        assert "defective product" in result

    def test_includes_communication_guidelines(self, llm_client):
        """Assembled prompt should always include communication guidelines."""
        result = llm_client.assemble_prompt(
            persona_prompt="Persona",
            guardrails={"allowed_topics": []},
            scenario_context="",
            rag_context=None,
            blocked_topics=[],
        )
        assert "Communication Guidelines:" in result
        assert "Keep responses concise" in result
        assert "Stay in character" in result

    def test_includes_blocked_topics(self, llm_client):
        """Assembled prompt should list blocked topics when provided."""
        result = llm_client.assemble_prompt(
            persona_prompt="Persona",
            guardrails={"allowed_topics": []},
            scenario_context="",
            rag_context=None,
            blocked_topics=["politics", "religion"],
        )
        assert "Blocked Topics" in result
        assert "politics" in result
        assert "religion" in result

    def test_includes_allowed_topics(self, llm_client):
        """Assembled prompt should mention allowed topics from guardrails."""
        result = llm_client.assemble_prompt(
            persona_prompt="Persona",
            guardrails={"allowed_topics": ["sales", "negotiation"]},
            scenario_context="",
            rag_context=None,
            blocked_topics=[],
        )
        assert "sales" in result
        assert "negotiation" in result
        assert "focused on" in result

    def test_includes_rag_context(self, llm_client):
        """Assembled prompt should include RAG context when provided."""
        rag = "Reference material:\n[Source 1: manual.pdf]\nSome relevant content."
        result = llm_client.assemble_prompt(
            persona_prompt="Persona",
            guardrails={"allowed_topics": []},
            scenario_context="",
            rag_context=rag,
            blocked_topics=[],
        )
        assert "Reference material" in result
        assert "manual.pdf" in result

    def test_no_rag_context_when_none(self, llm_client):
        """RAG context section should be absent when rag_context is None."""
        result = llm_client.assemble_prompt(
            persona_prompt="Persona",
            guardrails={"allowed_topics": []},
            scenario_context="",
            rag_context=None,
            blocked_topics=[],
        )
        assert "Reference material" not in result

    def test_no_scenario_context_when_empty(self, llm_client):
        """Scenario context section should be absent when empty string."""
        result = llm_client.assemble_prompt(
            persona_prompt="Persona",
            guardrails={"allowed_topics": []},
            scenario_context="",
            rag_context=None,
            blocked_topics=[],
        )
        assert "Scenario Context:" not in result


class TestChunkBuffering:
    """Tests for chunk buffering logic (sentence boundary and token threshold)."""

    def test_sentence_end_pattern_matches_period(self):
        """SENTENCE_END should match a period at end of string."""
        assert SENTENCE_END.search("Hello world.")

    def test_sentence_end_pattern_matches_question_mark(self):
        """SENTENCE_END should match a question mark at end of string."""
        assert SENTENCE_END.search("How are you?")

    def test_sentence_end_pattern_matches_exclamation(self):
        """SENTENCE_END should match an exclamation mark at end of string."""
        assert SENTENCE_END.search("Great job!")

    def test_sentence_end_pattern_matches_with_trailing_space(self):
        """SENTENCE_END should match sentence-ending punctuation followed by space."""
        assert SENTENCE_END.search("Hello. ")

    def test_sentence_end_no_match_mid_word(self):
        """SENTENCE_END should not match mid-sentence text without punctuation."""
        assert not SENTENCE_END.search("Hello world")

    @pytest.mark.asyncio
    async def test_sentence_boundary_yields_chunk(self, llm_client):
        """Text ending with sentence punctuation and >= 5 words should yield a chunk."""
        # Simulate streaming tokens that form a complete sentence
        tokens = ["I ", "would ", "be ", "happy ", "to ", "help ", "you."]

        mock_chunks = []
        for token in tokens:
            mock_delta = MagicMock()
            mock_delta.content = token
            mock_choice = MagicMock()
            mock_choice.delta = mock_delta
            mock_chunk = MagicMock()
            mock_chunk.choices = [mock_choice]
            mock_chunks.append(mock_chunk)

        # Add a final chunk with no content to signal end
        final_delta = MagicMock()
        final_delta.content = None
        final_choice = MagicMock()
        final_choice.delta = final_delta
        final_chunk = MagicMock()
        final_chunk.choices = [final_choice]
        mock_chunks.append(final_chunk)

        async def mock_stream():
            for c in mock_chunks:
                yield c

        llm_client.client = MagicMock()
        llm_client.client.chat.completions.create = AsyncMock(
            return_value=mock_stream()
        )

        chunks = []
        async for text in llm_client.generate_response(
            system_prompt="Test",
            conversation_history=[],
            current_utterance="Hello",
        ):
            chunks.append(text)

        # The sentence should be yielded as a chunk
        assert len(chunks) >= 1
        combined = " ".join(chunks)
        assert "help" in combined
        assert "you" in combined

    @pytest.mark.asyncio
    async def test_40_token_threshold_forces_yield(self, llm_client):
        """Buffer should be flushed after 40 tokens even without sentence boundary."""
        # Generate 45 tokens without sentence-ending punctuation
        tokens = [f"word{i} " for i in range(45)]

        mock_chunks = []
        for token in tokens:
            mock_delta = MagicMock()
            mock_delta.content = token
            mock_choice = MagicMock()
            mock_choice.delta = mock_delta
            mock_chunk = MagicMock()
            mock_chunk.choices = [mock_choice]
            mock_chunks.append(mock_chunk)

        async def mock_stream():
            for c in mock_chunks:
                yield c

        llm_client.client = MagicMock()
        llm_client.client.chat.completions.create = AsyncMock(
            return_value=mock_stream()
        )

        chunks = []
        async for text in llm_client.generate_response(
            system_prompt="Test",
            conversation_history=[],
            current_utterance="Hello",
        ):
            chunks.append(text)

        # Should yield at least 2 chunks (40 tokens + remaining 5)
        assert len(chunks) >= 2
