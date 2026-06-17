"""Verify the short-lived signed WebSocket ticket issued by the API gateway.

Token format (must match apps/api/src/utils/ws-ticket.ts):
    base64url(json({sid, uid, exp})) "." base64url(HMAC_SHA256(secret, payload))
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from src.config import settings


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def verify_ticket(token: str) -> dict | None:
    """Return the {sid, uid, exp} payload if the ticket is valid and unexpired, else None."""
    secret = settings.ws_ticket_secret or settings.internal_api_key
    if not secret or not token or "." not in token:
        return None
    payload_b64, sig = token.rsplit(".", 1)
    expected = (
        base64.urlsafe_b64encode(
            hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
        )
        .rstrip(b"=")
        .decode()
    )
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        data = json.loads(_b64url_decode(payload_b64).decode())
    except Exception:
        return None
    if not isinstance(data, dict) or not data.get("sid") or not data.get("uid"):
        return None
    if float(data.get("exp", 0)) < time.time():
        return None
    return data
