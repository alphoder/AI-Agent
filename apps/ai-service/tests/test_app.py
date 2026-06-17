"""Smoke tests for the AI service app wiring (no network)."""
from src.main import app


def test_routes_registered():
    paths = {r.path for r in app.routes if hasattr(r, "path")}
    assert "/ws/session" in paths
    assert "/scoring/evaluate" in paths
    assert "/health" in paths


def test_scoring_weighted_math():
    # overall_score = sum(score/5 * weight/100) * 100
    criteria = [{"score": 5, "weight": 50}, {"score": 3, "weight": 50}]
    overall = round(sum((c["score"] / 5) * (c["weight"] / 100) for c in criteria) * 100, 1)
    assert overall == 80.0
