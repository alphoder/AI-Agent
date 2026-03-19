"""Input/output guardrails engine.

Filters content for safety, PII, blocked topics, and prompt injection.
"""
from __future__ import annotations

import re
import structlog

from src.core.constants import EMAIL_PATTERN, PHONE_PATTERN, SSN_PATTERN

logger = structlog.get_logger(__name__)

# Prompt injection patterns
INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(previous|above|all)\s+(instructions|prompts)", re.I),
    re.compile(r"you\s+are\s+now\s+", re.I),
    re.compile(r"system\s*prompt", re.I),
    re.compile(r"disregard\s+(your|all)", re.I),
]


class GuardrailsEngine:
    """Content safety guardrails for input and output."""

    def __init__(self, config: dict):
        self.allowed_topics = config.get("allowed_topics", [])
        self.blocked_topics = config.get("blocked_topics", [])
        self.escalation_triggers = config.get("escalation_triggers", [])
        self.max_response_tokens = config.get("max_response_tokens", 256)

    def check_input(self, text: str) -> tuple[bool, str | None]:
        """Check input for safety violations. Returns (is_safe, violation_reason)."""
        # Strip control chars and HTML
        cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
        cleaned = re.sub(r"<[^>]+>", "", cleaned)

        # Check prompt injection
        for pattern in INJECTION_PATTERNS:
            if pattern.search(cleaned):
                logger.warn("guardrail_input_injection", text=text[:100])
                return False, "prompt_injection_detected"

        # Check blocked topics
        for topic in self.blocked_topics:
            if topic.lower() in cleaned.lower():
                logger.warn("guardrail_blocked_topic", topic=topic)
                return False, f"blocked_topic:{topic}"

        return True, None

    def check_output(self, text: str) -> tuple[bool, str | None]:
        """Check output for safety violations."""
        # PII detection
        if EMAIL_PATTERN.search(text):
            return False, "pii_email"
        if PHONE_PATTERN.search(text):
            return False, "pii_phone"
        if SSN_PATTERN.search(text):
            return False, "pii_ssn"

        # Blocked topics
        for topic in self.blocked_topics:
            if topic.lower() in text.lower():
                return False, f"blocked_topic:{topic}"

        return True, None

    def get_safe_fallback(self) -> str:
        """Return a safe fallback response."""
        return "I appreciate your question. Let me redirect our conversation back to the training topic. How can I help you with the scenario we're working on?"
