"""Shared fixtures for AI service tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.guardrails import GuardrailsEngine


@pytest.fixture
def guardrails_engine():
    """Create a GuardrailsEngine with default blocked topics."""
    return GuardrailsEngine({
        "blocked_topics": ["politics", "religion"],
        "allowed_topics": ["sales", "customer service"],
        "escalation_triggers": ["speak to manager"],
        "max_response_tokens": 256,
    })


@pytest.fixture
def clean_guardrails_engine():
    """Create a GuardrailsEngine with no blocked topics."""
    return GuardrailsEngine({
        "blocked_topics": [],
        "allowed_topics": [],
        "escalation_triggers": [],
    })


@pytest.fixture
def sample_transcript():
    """Sample conversation transcript for scoring tests."""
    return [
        {"role": "user", "content": "Hi, I'd like to discuss a product return."},
        {"role": "avatar", "content": "Of course! I'd be happy to help with your return. Could you tell me more about the issue?"},
        {"role": "user", "content": "The product arrived damaged. I need a refund."},
        {"role": "avatar", "content": "I understand how frustrating that must be. Let me look into that for you right away."},
    ]


@pytest.fixture
def sample_rubric():
    """Sample rubric for scoring tests."""
    return [
        {
            "name": "Empathy",
            "description": "Shows understanding of customer feelings",
            "weight": 40,
            "levels": [
                {"score": 1, "description": "No empathy shown"},
                {"score": 3, "description": "Some empathy"},
                {"score": 5, "description": "Excellent empathy"},
            ],
        },
        {
            "name": "Problem Solving",
            "description": "Effectively addresses the customer issue",
            "weight": 60,
            "levels": [
                {"score": 1, "description": "Did not address issue"},
                {"score": 3, "description": "Partially addressed"},
                {"score": 5, "description": "Fully resolved"},
            ],
        },
    ]


@pytest.fixture
def mock_settings():
    """Mock settings object for modules that import from src.config."""
    with patch("src.config.settings") as mock_s:
        mock_s.openai_api_key = "test-key"
        mock_s.openai_model = "gpt-4o"
        mock_s.pinecone_api_key = "test-pinecone-key"
        mock_s.pinecone_index = "test-index"
        yield mock_s
