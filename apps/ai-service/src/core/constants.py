"""Shared constants for the AI service.

Centralises PII regex patterns so that stt.py and guardrails.py
use identical definitions.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# PII detection patterns
# ---------------------------------------------------------------------------
EMAIL_PATTERN = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")
PHONE_PATTERN = re.compile(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b")
SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

# Ordered list used by the redact_pii helper in stt.py
PII_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (EMAIL_PATTERN, "[EMAIL]"),
    (PHONE_PATTERN, "[PHONE]"),
    (SSN_PATTERN, "[SSN]"),
]
