"""Tests for MCP server tools without requiring an LLM."""
import pandas as pd
import pytest

from f1_ai.mcp_server import (
    f1_compare_teammates_corner,
    f1_get_energy_signature,
    f1_get_segment_deltas,
    f1_list_corners,
    f1_list_drivers,
    f1_list_sessions,
    f1_query_tyre_degradation,
    f1_schema,
)
from f1_ai.store.parquet_store import write_table


@pytest.fixture(autouse=True)
def setup_mock_session():
    sid = "2024_99_FP2"
    meta = pd.DataFrame([{
        "session_id": sid,
        "year": 2024,
        "round": 99,
        "event_name": "Test Grand Prix",
        "location": "Mock Circuit",
        "session_type": "Practice 2",
        "session_date": "2024-09-01T15:00:00",
        "fastf1_version": "3.4.0",
        "pipeline_version": "2.0.0",
        "ingested_at": "2024-09-01T17:00:00",
    }])
    write_table(meta, "session_metadata", sid)

    laps = pd.DataFrame([
        {"session_id": sid, "driver": "NOR", "team": "McLaren", "run_type": "push", "lap_number": 1},
        {"session_id": sid, "driver": "PIA", "team": "McLaren", "run_type": "push", "lap_number": 1},
    ])
    write_table(laps, "laps", sid)

    corners = pd.DataFrame([
        {
            "session_id": sid,
            "driver": "NOR",
            "team": "McLaren",
            "corner": "T1",
            "corner_order": 0,
            "run_type": "push",
            "n_laps": 3,
            "brake_before_corner_m": 90.0,
            "brake_before_corner_iqr_m": 5.0,
            "min_speed_kmh": 120.0,
            "min_speed_iqr_kmh": 2.0,
            "full_throttle_after_corner_m": 45.0,
            "full_throttle_iqr_m": 3.0,
            "brake_to_full_throttle_m": 135.0,
            "peak_decel_g_est": 4.5,
            "corner_style": "V-style",
        },
        {
            "session_id": sid,
            "driver": "PIA",
            "team": "McLaren",
            "corner": "T1",
            "corner_order": 0,
            "run_type": "push",
            "n_laps": 3,
            "brake_before_corner_m": 85.0,
            "brake_before_corner_iqr_m": 4.0,
            "min_speed_kmh": 122.0,
            "min_speed_iqr_kmh": 2.5,
            "full_throttle_after_corner_m": 42.0,
            "full_throttle_iqr_m": 3.0,
            "brake_to_full_throttle_m": 127.0,
            "peak_decel_g_est": 4.6,
            "corner_style": "V-style",
        },
    ])
    write_table(corners, "corner_metrics", sid)

    deltas = pd.DataFrame([{
        "session_id": sid,
        "team": "McLaren",
        "driver_a": "NOR",
        "driver_b": "PIA",
        "run_type": "push",
        "segment": "start-T1",
        "segment_order": 0,
        "delta_s": -0.05,
        "ci_low_s": -0.08,
        "ci_high_s": -0.02,
        "n_a": 3,
        "n_b": 3,
        "significant": True,
    }])
    write_table(deltas, "segment_deltas", sid)

    tyre = pd.DataFrame([{
        "session_id": sid,
        "run_id": "NOR_1",
        "driver": "NOR",
        "team": "McLaren",
        "compound": "MEDIUM",
        "tyre_life_start": 1.0,
        "n_laps_total": 10,
        "n_laps_used": 8,
        "base_pace_s": 92.5,
        "deg_s_per_lap": 0.08,
        "deg_ci_low": 0.06,
        "deg_ci_high": 0.10,
        "residual_std_s": 0.15,
        "fuel_kg_per_lap": 1.2,
        "fuel_s_per_kg": 0.03,
        "method": "theil-sen",
    }])
    write_table(tyre, "tyre_stints", sid)

    energy = pd.DataFrame([{
        "session_id": sid,
        "driver": "NOR",
        "team": "McLaren",
        "straight": "after_T1",
        "run_type": "push",
        "n_laps": 3,
        "v_start_kmh": 200.0,
        "v_peak_kmh": 320.0,
        "v_end_kmh": 315.0,
        "peak_at_frac": 0.75,
        "late_loss_kmh": 5.0,
        "clipping_flag": True,
    }])
    write_table(energy, "energy_signature", sid)


def test_list_sessions():
    sessions = f1_list_sessions()
    assert any(s["session_id"] == "2024_99_FP2" for s in sessions)


def test_list_drivers():
    drivers = f1_list_drivers("2024_99_FP2")
    assert len(drivers) == 2
    assert any(d["driver"] == "NOR" for d in drivers)


def test_list_corners():
    corners = f1_list_corners("2024_99_FP2")
    assert corners == ["T1"]


def test_compare_teammates_corner():
    rows = f1_compare_teammates_corner("2024_99_FP2", "McLaren", "T1")
    assert len(rows) == 2
    assert {r["driver"] for r in rows} == {"NOR", "PIA"}


def test_segment_deltas():
    rows = f1_get_segment_deltas("2024_99_FP2", "McLaren")
    assert len(rows) == 1
    assert rows[0]["segment"] == "start-T1"
    assert rows[0]["significant"] is True


def test_tyre_degradation():
    rows = f1_query_tyre_degradation("2024_99_FP2", compound="MEDIUM")
    assert len(rows) == 1
    assert rows[0]["driver"] == "NOR"
    assert rows[0]["deg_s_per_lap"] == 0.08


def test_energy_signature():
    rows = f1_get_energy_signature("2024_99_FP2", "McLaren")
    assert len(rows) == 1
    assert rows[0]["clipping_flag"] is True


def test_schema_resource():
    schema = f1_schema()
    assert "session_metadata" in schema
    assert "corner_metrics" in schema


def test_unknown_session_raises():
    with pytest.raises(ValueError, match="Unknown session_id"):
        f1_list_drivers("UNKNOWN_SESSION")
