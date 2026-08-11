"""What a single live call actually cost.

Two things are measured, because no one system knows both:

  * Gemini reports what it billed, in `usageMetadata`, broken down by modality.
    That is the authoritative number — not a model, not an estimate — and until
    now the relay was throwing it away.
  * Only the relay sees the audio bytes it forwards. Google never bills those;
    Render does, at a per-GB rate, on both outbound legs. Nothing else in the
    stack can count them.

Add the two and you have the real cost of a call. Rates are constants because
they change rarely and loudly; when they move, they move here, and
`test_meter.py` will tell you if the arithmetic broke.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import structlog

from src.metrics import call_cost_paise_total, call_egress_bytes_total

logger = structlog.get_logger(__name__)

# --- rates ------------------------------------------------------------------
# USD per 1M tokens, from ai.google.dev/gemini-api/docs/pricing (12 Aug 2026).
# The live models are preview models: expect these to move.
LIVE_AUDIO_IN = 3.00
LIVE_AUDIO_OUT = 12.00
LIVE_TEXT_IN = 0.75
LIVE_TEXT_OUT = 4.50

# USD per GB of outbound traffic from the relay host (render.com/pricing).
EGRESS_PER_GB = 0.15

USD_TO_INR = 100.0


def _modality_tokens(details: list | None) -> dict[str, int]:
    """Flatten a ModalityTokenCount list into {modality: tokens}."""
    out: dict[str, int] = {}
    for d in details or []:
        if not isinstance(d, dict):
            continue
        modality = str(d.get("modality") or "").upper()
        try:
            out[modality] = out.get(modality, 0) + int(d.get("tokenCount") or 0)
        except (TypeError, ValueError):
            continue
    return out


@dataclass
class CallMeter:
    """Accumulates one call's usage. Cheap enough to run on every message."""

    audio_in_tokens: int = 0
    audio_out_tokens: int = 0
    text_in_tokens: int = 0
    text_out_tokens: int = 0
    egress_bytes: int = 0
    _usage_seen: bool = field(default=False, repr=False)

    def note_egress(self, payload: str | bytes | None) -> None:
        """Count one outbound payload. Call wherever the relay sends."""
        if not payload:
            return
        self.egress_bytes += len(payload) if isinstance(payload, bytes) else len(payload.encode("utf-8", "ignore"))

    def note_usage(self, usage: dict | None) -> None:
        """Absorb a `usageMetadata` block from Gemini.

        The counts are cumulative for the session, so later messages supersede
        earlier ones — take the max rather than summing, or a call is billed
        once per message that reports it.
        """
        if not isinstance(usage, dict):
            return
        self._usage_seen = True
        prompt = _modality_tokens(usage.get("promptTokensDetails"))
        response = _modality_tokens(usage.get("responseTokensDetails"))

        self.audio_in_tokens = max(self.audio_in_tokens, prompt.get("AUDIO", 0))
        self.text_in_tokens = max(self.text_in_tokens, prompt.get("TEXT", 0))
        self.audio_out_tokens = max(self.audio_out_tokens, response.get("AUDIO", 0))
        self.text_out_tokens = max(self.text_out_tokens, response.get("TEXT", 0))

        # Some responses report only the totals. Rather than lose the call
        # entirely, book the remainder as audio — it is the dominant modality
        # here and the expensive one, so this errs upward, never down.
        if not prompt and not response:
            total_in = int(usage.get("promptTokenCount") or 0)
            total_out = int(usage.get("responseTokenCount") or 0)
            self.audio_in_tokens = max(self.audio_in_tokens, total_in)
            self.audio_out_tokens = max(self.audio_out_tokens, total_out)

    @property
    def measured(self) -> bool:
        """False when Gemini never reported usage — the cost is egress only."""
        return self._usage_seen

    def breakdown(self) -> dict[str, float]:
        """Rupees, itemised. Rounded to paise at the edges only."""
        audio_in = self.audio_in_tokens / 1e6 * LIVE_AUDIO_IN
        audio_out = self.audio_out_tokens / 1e6 * LIVE_AUDIO_OUT
        text_in = self.text_in_tokens / 1e6 * LIVE_TEXT_IN
        text_out = self.text_out_tokens / 1e6 * LIVE_TEXT_OUT
        egress = self.egress_bytes / 1e9 * EGRESS_PER_GB
        total = audio_in + audio_out + text_in + text_out + egress

        r = lambda usd: round(usd * USD_TO_INR, 4)  # noqa: E731
        return {
            "audio_in_inr": r(audio_in),
            "audio_out_inr": r(audio_out),
            "text_in_inr": r(text_in),
            "text_out_inr": r(text_out),
            "egress_inr": r(egress),
            "total_inr": r(total),
            "total_paise": round(total * USD_TO_INR * 100),
            "audio_in_tokens": self.audio_in_tokens,
            "audio_out_tokens": self.audio_out_tokens,
            "egress_mb": round(self.egress_bytes / 1e6, 2),
            "measured": self.measured,
        }


def report_cost(relay: str, meter: CallMeter, **context) -> dict[str, float]:
    """Log and record one call's cost. Safe to call in a `finally` block.

    Never raises: a teardown path is the worst possible place to lose a session
    over an accounting detail.
    """
    try:
        b = meter.breakdown()
        for component in ("audio_in", "audio_out", "text_in", "text_out", "egress"):
            paise = round(b[f"{component}_inr"] * 100)
            if paise:
                call_cost_paise_total.labels(relay=relay, component=component).inc(paise)
        call_egress_bytes_total.labels(relay=relay).inc(meter.egress_bytes)
        logger.info("call.cost", relay=relay, **b, **context)
        return b
    except Exception as err:  # noqa: BLE001
        logger.warning("call.cost_failed", relay=relay, error=str(err))
        return {}
