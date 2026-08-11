"""The meter decides what a call is reported to have cost, so a mistake here is
a wrong number on an invoice-shaped screen. These are the cases that would make
it lie.

Run: apps/ai-service/.venv/bin/python apps/ai-service/scripts/test_meter.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.core.meter import CallMeter  # noqa: E402


def usage(audio_in=0, audio_out=0, text_in=0, text_out=0):
    return {
        "promptTokensDetails": [
            {"modality": "AUDIO", "tokenCount": audio_in},
            {"modality": "TEXT", "tokenCount": text_in},
        ],
        "responseTokensDetails": [
            {"modality": "AUDIO", "tokenCount": audio_out},
            {"modality": "TEXT", "tokenCount": text_out},
        ],
    }


# --- usageMetadata is cumulative, so repeats must not add up ----------------
m = CallMeter()
m.note_usage(usage(audio_in=1_000, audio_out=400))
m.note_usage(usage(audio_in=5_000, audio_out=2_000))   # later message supersedes
m.note_usage(usage(audio_in=9_000, audio_out=3_600))
b = m.breakdown()
assert m.audio_in_tokens == 9_000, m.audio_in_tokens
assert m.audio_out_tokens == 3_600, m.audio_out_tokens
# 9k @ $3/1M = $0.027 -> ₹2.70 ; 3.6k @ $12/1M = $0.0432 -> ₹4.32
assert abs(b["audio_in_inr"] - 2.70) < 0.01, b
assert abs(b["audio_out_inr"] - 4.32) < 0.01, b

# A late message reporting LOWER counts must not walk the total backwards.
m.note_usage(usage(audio_in=10, audio_out=10))
assert m.audio_in_tokens == 9_000
assert m.audio_out_tokens == 3_600

# --- egress ----------------------------------------------------------------
m2 = CallMeter()
m2.note_egress("x" * 20_500_000)                       # a whole call's audio
b2 = m2.breakdown()
assert abs(b2["egress_mb"] - 20.5) < 0.01, b2
# 20.5 MB @ $0.15/GB = $0.003075 -> ₹0.3075
assert abs(b2["egress_inr"] - 0.31) < 0.01, b2
m2.note_egress(None)                                   # nothing sent, nothing counted
m2.note_egress("")
assert abs(m2.breakdown()["egress_mb"] - 20.5) < 0.01

# Bytes and str are both accepted, and multi-byte characters count as bytes.
m3 = CallMeter()
m3.note_egress(b"1234")
m3.note_egress("é")                                    # 2 bytes in UTF-8, not 1
assert m3.egress_bytes == 6, m3.egress_bytes

# --- a whole realistic call ------------------------------------------------
call = CallMeter()
call.note_usage(usage(audio_in=9_600, audio_out=3_840, text_in=800, text_out=0))
call.note_egress("x" * 20_500_000)
t = call.breakdown()
assert call.measured is True
# Should land near the modelled ₹6.67 for a 5-minute call. If this drifts far,
# either the model or the rates are wrong — both are worth knowing.
assert 5.0 < t["total_inr"] < 9.0, t
assert t["total_paise"] == round(t["total_inr"] * 100), t

# --- degraded inputs must not throw ----------------------------------------
bad = CallMeter()
bad.note_usage(None)
bad.note_usage({})
bad.note_usage({"promptTokensDetails": "nonsense"})
bad.note_usage({"promptTokensDetails": [{"modality": "AUDIO", "tokenCount": "abc"}]})
assert bad.breakdown()["total_inr"] == 0.0
assert bad.measured is True or bad.measured is False   # never raises

# Totals-only responses still book something rather than reporting a free call.
totals = CallMeter()
totals.note_usage({"promptTokenCount": 9_000, "responseTokenCount": 3_600})
assert totals.breakdown()["total_inr"] > 6.0, totals.breakdown()

# A call Gemini never reported on is flagged, not silently priced at zero.
quiet = CallMeter()
quiet.note_egress("x" * 1_000_000)
assert quiet.measured is False
assert quiet.breakdown()["total_inr"] > 0

print("meter: all checks passed")
