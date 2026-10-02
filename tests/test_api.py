"""Tests for the F1 AI Race Engineer FastAPI endpoints."""
from starlette.testclient import TestClient

from f1_ai.api import app

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "laps" in data["tables"]
    assert "corner_metrics" in data["tables"]


def test_list_sessions():
    res = client.get("/api/sessions")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    session_ids = [s["session_id"] for s in data]
    assert "2026_01_FP2" in session_ids or "2024_99_FP2" in session_ids


def test_list_drivers():
    res = client.get("/api/sessions/2026_01_FP2/drivers")
    assert res.status_code == 200
    data = res.json()
    assert "teams" in data
    team_names = [t["team"] for t in data["teams"]]
    assert any("McLaren" in t for t in team_names)


def test_list_corners():
    res = client.get("/api/sessions/2026_01_FP2/corners")
    assert res.status_code == 200
    corners = res.json()
    assert isinstance(corners, list)
    assert "T1" in corners


def test_compare_corners():
    res = client.get(
        "/api/sessions/2026_01_FP2/corners/compare",
        params={"team": "McLaren", "corner": "T1", "run_type": "push"},
    )
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    drivers = [r["driver"] for r in rows]
    assert "PIA" in drivers or "NOR" in drivers


def test_segment_deltas():
    res = client.get(
        "/api/sessions/2026_01_FP2/segments",
        params={"team": "McLaren", "run_type": "push"},
    )
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    assert "segment" in rows[0]
    assert "delta_s" in rows[0]


def test_tyre_degradation():
    res = client.get("/api/sessions/2026_01_FP2/tyre")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    assert "deg_s_per_lap" in rows[0]


def test_energy_signature():
    res = client.get("/api/sessions/2026_01_FP2/energy", params={"team": "Williams"})
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    assert any(r["clipping_flag"] for r in rows)
