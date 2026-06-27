"""Shared WebSocket origin check for the relays.

A browser always sends an `Origin` header on a WebSocket handshake; non-browser
clients may omit it. We allow:
  - requests with no Origin (server-to-server / tests),
  - any loopback host (localhost / 127.0.0.1 / ::1) regardless of port — dev,
  - any origin explicitly listed in settings.cors_origins — production.

Keeping this in one place avoids the two relays drifting apart.
"""
from __future__ import annotations

from urllib.parse import urlparse

from src.config import settings

_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        return True
    if origin in settings.cors_origins:
        return True
    try:
        host = urlparse(origin).hostname
    except Exception:  # noqa: BLE001
        return False
    return host in _LOOPBACK_HOSTS
