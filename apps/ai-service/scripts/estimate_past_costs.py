"""What the calls we already ran probably cost.

The meter (src/core/meter.py) reads Gemini's own usageMetadata, but that only
exists while a session is live — it was never stored, so past calls cannot be
priced exactly. They can be reconstructed, because two things were stored:

  * sessions.duration_sec  — the mic streams for the whole call, so this is the
    audio-input duration almost exactly.
  * session_transcripts    — the avatar's own words, whose length gives the
    output speech duration, which is what audio output is billed on.

Rates per second come from a live probe, not from the published per-minute
convenience rates, which measured about 17% low on input.

Read-only. Usage:
    DATABASE_URL='postgres://...' python scripts/estimate_past_costs.py
"""
from __future__ import annotations

import csv
import io
import os
import subprocess
import sys

# --- measured rates ---------------------------------------------------------
AUDIO_IN_TOK_PER_SEC = 32.6      # probed: 376 tokens for 11.5s of streamed audio
AUDIO_OUT_TOK_PER_SEC = 25.0     # $0.018/min at $12/1M
CHARS_PER_SEC_SPOKEN = 15.0      # ~150 wpm of natural TTS

USD_PER_1M_IN, USD_PER_1M_OUT = 3.00, 12.00
FLASH_IN, FLASH_OUT = 0.30, 2.50          # gemini-3.5-flash-lite, scoring
SCORE_IN_TOK, SCORE_OUT_TOK = 4000, 1800
EGRESS_USD_PER_GB = 0.15
UP_BYTES_PER_SEC = 16000 * 2 * 4 / 3      # base64 PCM to Gemini
DOWN_BYTES_PER_SEC = 24000 * 2 * 4 / 3    # base64 PCM back to the browser
INR = 100.0

QUERY = """
SELECT s.id,
       COALESCE(s.duration_sec, 0)                                   AS duration_sec,
       s.status,
       s.scored,
       COALESCE(SUM(length(t.content)) FILTER (WHERE t.role = 'avatar'), 0) AS avatar_chars
FROM sessions s
LEFT JOIN session_transcripts t ON t.session_id = s.id
GROUP BY s.id, s.duration_sec, s.status, s.scored
ORDER BY s.created_at;
"""


def rows(url: str):
    out = subprocess.run(["psql", url, "--csv", "-c", QUERY], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr.strip()[:400] or "psql failed")
    return list(csv.DictReader(io.StringIO(out.stdout)))


def cost_of(duration_sec: float, avatar_chars: float, scored: bool) -> dict:
    spoken_sec = avatar_chars / CHARS_PER_SEC_SPOKEN
    audio_in = duration_sec * AUDIO_IN_TOK_PER_SEC / 1e6 * USD_PER_1M_IN
    audio_out = spoken_sec * AUDIO_OUT_TOK_PER_SEC / 1e6 * USD_PER_1M_OUT
    scoring = (SCORE_IN_TOK / 1e6 * FLASH_IN + SCORE_OUT_TOK / 1e6 * FLASH_OUT) if scored else 0.0
    egress_b = duration_sec * UP_BYTES_PER_SEC + spoken_sec * DOWN_BYTES_PER_SEC
    egress = egress_b / 1e9 * EGRESS_USD_PER_GB
    return {
        "audio_in": audio_in * INR,
        "audio_out": audio_out * INR,
        "scoring": scoring * INR,
        "egress": egress * INR,
        "total": (audio_in + audio_out + scoring + egress) * INR,
        "spoken_sec": spoken_sec,
        "egress_mb": egress_b / 1e6,
    }


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("set DATABASE_URL")

    data = rows(url)
    priced = [
        (r, cost_of(float(r["duration_sec"]), float(r["avatar_chars"]), r["scored"] == "t"))
        for r in data
    ]
    ran = [(r, c) for r, c in priced if float(r["duration_sec"]) > 0]

    print(f"{len(data)} sessions on record, {len(ran)} of them actually ran.\n")
    if not ran:
        return

    print(f"{'call':<10}{'secs':>6}{'AI spoke':>10}{'audio in':>10}{'audio out':>11}"
          f"{'score':>8}{'egress':>9}{'TOTAL':>9}")
    for r, c in ran[-12:]:
        print(f"{r['id'][:8]:<10}{float(r['duration_sec']):>6.0f}{c['spoken_sec']:>9.0f}s"
              f"{c['audio_in']:>10.2f}{c['audio_out']:>11.2f}{c['scoring']:>8.2f}"
              f"{c['egress']:>9.2f}{c['total']:>9.2f}")
    if len(ran) > 12:
        print(f"{'':<10}… {len(ran) - 12} earlier calls not shown")

    tot = {k: sum(c[k] for _, c in ran) for k in ("audio_in", "audio_out", "scoring", "egress", "total")}
    secs = sum(float(r["duration_sec"]) for r, _ in ran)
    mb = sum(c["egress_mb"] for _, c in ran)

    print(f"\n{'':-<73}")
    print(f"{len(ran)} calls, {secs / 60:.0f} minutes of conversation, {mb / 1000:.2f} GB of egress")
    print(f"  audio in   Rs {tot['audio_in']:>8.2f}")
    print(f"  audio out  Rs {tot['audio_out']:>8.2f}")
    print(f"  scoring    Rs {tot['scoring']:>8.2f}")
    print(f"  egress     Rs {tot['egress']:>8.2f}")
    print(f"  TOTAL      Rs {tot['total']:>8.2f}   ({tot['total'] / len(ran):.2f} per call)")
    print(f"\nAverage call ran {secs / len(ran):.0f}s against the 300s cap.")


if __name__ == "__main__":
    main()
