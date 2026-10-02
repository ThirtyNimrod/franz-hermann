"""Comprehensive test suite for 2026 Grand Prix sessions (2026_01_FP2 Australian GP).

Tests telemetry extraction, 11-team grid composition, corner metrics, teammate deltas,
tyre degradation, 2026 energy deployment clipping, and MCP query tools.
"""
import asyncio
import pytest

from f1_ai.harness.agent import ask
from f1_ai.mcp_server import (
    f1_compare_teammates_corner,
    f1_get_energy_signature,
    f1_get_segment_deltas,
    f1_list_corners,
    f1_list_drivers,
    f1_list_sessions,
    f1_query_tyre_degradation,
)
from f1_ai.store.duck import connect

SESSION_2026 = "2026_01_FP2"


def test_2026_session_ingested():
    """Verify 2026 Australian GP is registered in session_metadata."""
    sessions = f1_list_sessions(year=2026)
    assert any(s["session_id"] == SESSION_2026 for s in sessions)
    aus_gp = next(s for s in sessions if s["session_id"] == SESSION_2026)
    assert aus_gp["event_name"] == "Australian Grand Prix"
    assert aus_gp["round"] == 1


def test_2026_grid_11_teams_and_new_pairings():
    """Verify the 2026 grid derives all 11 teams and 22 drivers from session data."""
    drivers_data = f1_list_drivers(SESSION_2026)
    teams = {d["team"] for d in drivers_data}
    drivers = {d["driver"] for d in drivers_data}

    # 11 teams in 2026 regulations
    expected_teams = {
        "Ferrari", "McLaren", "Mercedes", "Red Bull Racing", "Aston Martin",
        "Alpine", "Williams", "Haas F1 Team", "Racing Bulls", "Audi", "Cadillac",
    }
    assert expected_teams.issubset(teams), f"Missing teams: {expected_teams - teams}"
    assert len(drivers) == 22

    # Check key 2026 driver transfers & rookies
    assert "HAM" in drivers  # Hamilton at Ferrari
    assert "LEC" in drivers
    assert "ANT" in drivers  # Antonelli at Mercedes
    assert "RUS" in drivers
    assert "BOR" in drivers  # Bortoleto at Audi
    assert "HUL" in drivers  # Hulkenberg at Audi
    assert "BOT" in drivers  # Bottas at Cadillac
    assert "PER" in drivers  # Perez at Cadillac


def test_2026_albert_park_corners_anchored():
    """Verify Albert Park corners are anchored and tracked in sequence."""
    corners = f1_list_corners(SESSION_2026)
    assert len(corners) >= 10
    assert "T1" in corners
    assert "T3" in corners
    assert "T10" in corners
    assert "T14" in corners


def test_2026_fastest_push_laps():
    """Question: What was the fastest push lap time and who set it in 2026 Australian GP FP2?"""
    con = connect()
    rows = con.execute(
        """SELECT driver, team, min(lap_time_s) as best_lap
           FROM laps WHERE session_id = ? AND run_type = 'push'
           GROUP BY driver, team ORDER BY best_lap LIMIT 3""",
        [SESSION_2026],
    ).fetchall()

    assert len(rows) == 3
    fastest_driver, fastest_team, best_time = rows[0]
    # Piastri set the benchmark push lap of 79.729s (1:19.729)
    assert fastest_driver == "PIA"
    assert fastest_team == "McLaren"
    assert 78.0 < best_time < 82.0


def test_2026_mercedes_t1_corner_comparison():
    """Question: In corner T1, how did Antonelli compare to Russell in minimum apex speed?"""
    rows = f1_compare_teammates_corner(SESSION_2026, team="Mercedes", corner="T1", run_type="push")
    assert len(rows) == 2
    metrics = {r["driver"]: r for r in rows}
    assert "RUS" in metrics and "ANT" in metrics

    rus = metrics["RUS"]
    ant = metrics["ANT"]

    assert rus["min_speed_kmh"] > 140.0
    assert ant["min_speed_kmh"] > 140.0
    assert rus["brake_before_corner_m"] > 80.0
    assert ant["brake_before_corner_m"] > 80.0
    # Russell carried higher apex speed (168 km/h vs 162 km/h)
    assert rus["min_speed_kmh"] >= ant["min_speed_kmh"]


def test_2026_mclaren_t1_corner_comparison():
    """Question: Comparing McLaren teammates into T1, who braked later and carried more apex speed?"""
    rows = f1_compare_teammates_corner(SESSION_2026, team="McLaren", corner="T1", run_type="push")
    assert len(rows) == 2
    metrics = {r["driver"]: r for r in rows}

    nor = metrics["NOR"]
    pia = metrics["PIA"]

    # Piastri carried 165 km/h vs Norris 161 km/h
    assert pia["min_speed_kmh"] > nor["min_speed_kmh"]
    # Piastri braked later (closer to corner: 78.9m vs 94.4m before corner)
    assert pia["brake_before_corner_m"] < nor["brake_before_corner_m"]


def test_2026_ferrari_t3_apex_and_braking():
    """Question: For Ferrari at T3, how did Hamilton compare to Leclerc?"""
    rows = f1_compare_teammates_corner(SESSION_2026, team="Ferrari", corner="T3", run_type="push")
    assert len(rows) == 2
    metrics = {r["driver"]: r for r in rows}

    ham = metrics["HAM"]
    lec = metrics["LEC"]

    # Leclerc carried 104 km/h vs Hamilton 103 km/h
    assert abs(lec["min_speed_kmh"] - 104.0) < 1.0
    assert abs(ham["min_speed_kmh"] - 103.0) < 1.0
    # Leclerc braked later (93.9m vs 99.5m)
    assert lec["brake_before_corner_m"] < ham["brake_before_corner_m"]


def test_2026_ferrari_teammate_segment_deltas():
    """Question: What was the teammate delta between Hamilton and Leclerc in the opening sector?"""
    rows = f1_get_segment_deltas(SESSION_2026, team="Ferrari", run_type="push", only_significant=False)
    assert len(rows) > 0
    segments = {r["segment"] for r in rows}
    assert "start-T1" in segments or "T1-T2" in segments

    delta_start_t1 = next((r for r in rows if r["segment"] == "start-T1"), None)
    if delta_start_t1:
        assert {delta_start_t1["driver_a"], delta_start_t1["driver_b"]} == {"HAM", "LEC"}
        assert abs(delta_start_t1["delta_s"]) < 2.0


def test_2026_mercedes_tyre_degradation_hard():
    """Question: What was the fuel-corrected tyre degradation for Antonelli on HARD compound?"""
    stints = f1_query_tyre_degradation(SESSION_2026, compound="HARD", driver="ANT")
    assert len(stints) >= 1
    ant_hard = stints[0]
    assert ant_hard["driver"] == "ANT"
    assert ant_hard["n_laps_used"] >= 5
    # Degradation slope: 0.026 s/lap over 11 laps
    assert 0.0 < ant_hard["deg_s_per_lap"] < 0.10
    assert ant_hard["fuel_kg_per_lap"] == 1.2
    assert ant_hard["fuel_s_per_kg"] == 0.03


def test_2026_cadillac_tyre_degradation_medium():
    """Question: What was Bottas' tyre degradation rate on MEDIUM tyres for Cadillac?"""
    stints = f1_query_tyre_degradation(SESSION_2026, compound="MEDIUM", driver="BOT")
    assert len(stints) >= 1
    bot_med = stints[0]
    assert bot_med["driver"] == "BOT"
    assert bot_med["team"] == "Cadillac"
    # Degradation: ~0.173 s/lap over 9 laps
    assert 0.10 < bot_med["deg_s_per_lap"] < 0.25


def test_2026_energy_clipping_on_straights():
    """Question: Did Williams or Aston Martin exhibit 2026 electrical energy clipping after T8?"""
    williams_sig = f1_get_energy_signature(SESSION_2026, team="Williams")
    assert len(williams_sig) > 0

    t8_straight = next((s for s in williams_sig if s["straight"] == "after_T8" and s["driver"] == "ALB"), None)
    assert t8_straight is not None
    # 2026 electrical deployment runs out: car reaches peak speed and loses speed before braking
    assert t8_straight["v_peak_kmh"] > 300.0
    assert t8_straight["late_loss_kmh"] > 10.0
    assert t8_straight["clipping_flag"] is True


def test_2026_driver_lap_counts_by_run_type():
    """Question: Did lap classification separate push, long_run, out_in, and cooldown laps correctly?"""
    drivers_data = f1_list_drivers(SESSION_2026)
    run_types = {d["run_type"] for d in drivers_data}
    assert "push" in run_types
    assert "out_in" in run_types
    # Total laps across all drivers in session
    total_laps = sum(d["laps"] for d in drivers_data)
    assert total_laps > 400


def test_agent_harness_answers_2026_audi_lineup():
    """Question answered via MCP agent harness: Who drives for Audi in 2026?"""
    reply = asyncio.run(ask("In 2026_01_FP2, what drivers drove for team Audi?", model="qwen3.5:4b"))
    reply_clean = reply.upper()
    assert "HUL" in reply_clean or "BOR" in reply_clean or "BORTOLETO" in reply_clean or "HULKENBERG" in reply_clean
