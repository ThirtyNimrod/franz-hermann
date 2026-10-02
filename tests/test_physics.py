"""Physics invariant and sanity tests."""
import numpy as np
import pandas as pd
import pytest

from f1_ai.physics.anchors import corner_anchors
from f1_ai.physics.corners import corner_metrics
from f1_ai.physics.energy import straight_signature
from f1_ai.physics.segments import segment_times, teammate_deltas
from f1_ai.physics.tyre import fit_degradation


def test_corner_anchors():
    # Synthetic lap: 1000m, circle or line
    distances = np.linspace(0, 1000, 100)
    # Put a corner at distance 500m, (X=50, Y=50)
    xs = distances / 10
    ys = distances / 10
    tel = pd.DataFrame({"Distance": distances, "X": xs, "Y": ys})
    corners = pd.DataFrame([{"Number": 1, "Letter": "", "Distance": 500.0, "X": 50.0, "Y": 50.0}])

    anchors = corner_anchors(tel, corners, ref_lap_len_m=1000.0)
    assert "T1" in anchors
    assert abs(anchors["T1"] - 500.0) < 15.0


def test_corner_metrics_braking_and_apex():
    # Distance 0 to 500m
    dist = np.linspace(0, 500, 200)
    # Anchor at 300m
    # Car slows from 300 km/h to 100 km/h between 200m and 300m, then accelerates back to 280 km/h
    speed = np.piecewise(
        dist,
        [dist < 200, (dist >= 200) & (dist <= 300), dist > 300],
        [300.0, lambda d: 300.0 - 2.0 * (d - 200), lambda d: 100.0 + 1.0 * (d - 300)],
    )
    brake = (dist >= 200) & (dist <= 280)
    throttle = np.where(dist > 350, 100.0, np.where(dist < 200, 100.0, 20.0))
    time_s = np.cumsum(np.gradient(dist) / (speed / 3.6))
    time_dt = pd.to_timedelta(time_s, unit="s")

    tel = pd.DataFrame({
        "Distance": dist,
        "Speed": speed,
        "Brake": brake,
        "Throttle": throttle,
        "Time": time_dt,
    })

    metrics = corner_metrics(tel, anchor_m=300.0, prev_anchor_m=0.0)
    assert metrics is not None
    assert metrics["brake_before_corner_m"] > 0
    assert abs(metrics["min_speed_kmh"] - 100.0) < 5.0
    assert metrics["min_speed_kmh"] < 300.0
    assert metrics["corner_style"] in ["U-style", "V-style"]


def test_segment_times_sum():
    # Distance 0 to 1000m, constant speed 50 m/s -> total lap time = 20s
    dist = np.linspace(0, 1000, 500)
    time_s = dist / 50.0
    tel = pd.DataFrame({
        "Distance": dist,
        "Time": pd.to_timedelta(time_s, unit="s"),
    })
    anchors = {"T1": 300.0, "T2": 700.0}
    st = segment_times(tel, anchors)
    assert len(st) == 3
    # Sum of segment times must equal total lap time (20s) within 0.05s
    assert abs(st.sum() - 20.0) < 0.05


def test_teammate_deltas():
    # 5 laps for driver A, 5 laps for driver B
    seg_a = pd.DataFrame({"T1-T2": [10.2, 10.1, 10.3, 10.2, 10.2]})
    seg_b = pd.DataFrame({"T1-T2": [10.5, 10.4, 10.6, 10.5, 10.5]})
    deltas = teammate_deltas(seg_a, seg_b, n_boot=500)
    assert not deltas.empty
    row = deltas.iloc[0]
    assert row["segment"] == "T1-T2"
    # A is ~0.3s faster than B, so delta (A - B) should be ~ -0.3s
    assert abs(row["delta_s"] - (-0.3)) < 0.05
    assert bool(row["significant"]) is True


def test_fit_degradation():
    # Stint of 10 laps, base pace 90.0s, true degradation 0.1s per lap of tyre age
    lap_numbers = np.arange(1, 11)
    tyre_life = np.arange(1, 11)
    fuel_kg_per_lap = 1.2
    fuel_s_per_kg = 0.03
    fuel_effect = lap_numbers * fuel_kg_per_lap * fuel_s_per_kg

    # Observed lap times = base pace + deg*age - fuel_effect
    lap_times = 90.0 + 0.1 * tyre_life - fuel_effect
    run = pd.DataFrame({
        "lap_number": lap_numbers,
        "tyre_life": tyre_life,
        "lap_time_s": lap_times,
        "compound": ["MEDIUM"] * 10,
    })

    deg = fit_degradation(run, fuel_kg_per_lap=fuel_kg_per_lap, fuel_s_per_kg=fuel_s_per_kg)
    assert deg is not None
    assert abs(deg["deg_s_per_lap"] - 0.1) < 0.01
    assert deg["compound"] == "MEDIUM"
    assert deg["n_laps_used"] >= 5


def test_straight_energy_signature():
    # Straight of 600m (distance 1000m to 1600m), full throttle
    dist = np.linspace(1000, 1600, 100)
    # Speed climbs to 320 at 1300m, then drops to 310 at 1600m (clipping)
    speed = np.piecewise(
        dist,
        [dist <= 1300, dist > 1300],
        [lambda d: 250 + (320 - 250) * (d - 1000) / 300, lambda d: 320 - 10 * (d - 1300) / 300],
    )
    tel = pd.DataFrame({
        "Distance": dist,
        "Speed": speed,
        "Throttle": np.full_like(dist, 100.0),
    })

    sig = straight_signature(tel, start_m=1000.0, end_m=1600.0)
    assert sig is not None
    assert abs(sig["v_peak_kmh"] - 320.0) < 1.0
    assert abs(sig["late_loss_kmh"] - 10.0) < 1.0
    assert sig["clipping_flag"] is True
