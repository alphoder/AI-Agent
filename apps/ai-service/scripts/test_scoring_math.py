"""
The score is the product. These check the two things that decide it: which weight
each criterion carries, and how the 0-100 falls out of them.

Run: .venv/bin/python scripts/test_scoring_math.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.core.scoring import _grade, _overall, _norm

RUBRIC = [
    {"name": "Opening & Rapport", "weight": 30},
    {"name": "Discovery", "weight": 50},
    {"name": "Close", "weight": 20},
]

# --- the rubric owns the weights, not the model ---------------------------------
{
    # The model echoed back weights that do not match the rubric at all. The grade
    # must come out as if it had echoed them correctly.
}
drifted = _grade([
    {"criterion_name": "Opening & Rapport", "score": 5, "weight": 80},
    {"criterion_name": "Discovery", "score": 1, "weight": 10},
    {"criterion_name": "Close", "score": 5, "weight": 10},
], RUBRIC)
assert [c["weight"] for c in drifted] == [30, 50, 20], drifted
# 30*1.0 + 50*0.2 + 20*1.0 = 60 of 100
assert _overall(drifted) == 60.0, _overall(drifted)
# Had we trusted the model: 80*1.0 + 10*0.2 + 10*1.0 = 92 — a fail dressed up as a pass.

# --- name matching survives the model re-casing and re-punctuating ---------------
assert _norm("Opening & Rapport") == _norm("opening and rapport") or _norm("Opening & Rapport") == "openingrapport"
loose = _grade([{"criterion_name": "  opening   &  RAPPORT ", "score": 4}], RUBRIC)
assert loose[0]["weight"] == 30, loose
assert loose[0]["criterion_name"] == "Opening & Rapport", "the rubric's spelling wins"
assert loose[0]["off_rubric"] is False

# --- an invented criterion is shown but cannot move the grade -------------------
invented = _grade([
    {"criterion_name": "Discovery", "score": 5},
    {"criterion_name": "Vibes", "score": 1},
], RUBRIC)
assert invented[1]["weight"] == 0.0 and invented[1]["off_rubric"] is True
assert _overall(invented) == 100.0, "a zero-weight extra must not drag a perfect score down"

# --- out-of-range and junk scores are clamped, never trusted --------------------
clamped = _grade([
    {"criterion_name": "Opening & Rapport", "score": 9},
    {"criterion_name": "Discovery", "score": -4},
    {"criterion_name": "Close", "score": "not a number"},
], RUBRIC)
assert [c["score"] for c in clamped] == [5.0, 0.0, 0.0], clamped

# --- per-criterion pass flag ----------------------------------------------------
flags = _grade([
    {"criterion_name": "Opening & Rapport", "score": 3},
    {"criterion_name": "Discovery", "score": 2},
], RUBRIC)
assert flags[0]["passed"] is True and flags[1]["passed"] is False

# --- fallbacks ------------------------------------------------------------------
assert _overall([]) == 0.0
# Nothing matched the rubric, so every weight is 0: fall back to an equal-weight mean
# rather than dividing by zero or returning 0 for a good call.
none_matched = _grade([{"criterion_name": "X", "score": 5}, {"criterion_name": "Y", "score": 0}], RUBRIC)
assert _overall(none_matched) == 50.0, _overall(none_matched)

# Fractional weights (0.3/0.5/0.2 instead of 30/50/20) still normalise to 0-100.
frac = _grade([{"criterion_name": "Discovery", "score": 5}],
              [{"name": "Discovery", "weight": 0.5}])
assert _overall(frac) == 100.0

print("scoring math: all checks passed")
