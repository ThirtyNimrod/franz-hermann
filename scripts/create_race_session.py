"""Generate realistic 2026 Australian GP Race (2026_01_R) session data in Parquet store."""
import numpy as np
import pandas as pd
from f1_ai.store.parquet_store import write_table

SESSION_ID = "2026_01_R"

# 1. Session Metadata
meta_df = pd.DataFrame([{
    "session_id": SESSION_ID,
    "year": 2026,
    "round": 1,
    "event_name": "Australian Grand Prix",
    "location": "Melbourne",
    "session_type": "Race",
    "session_date": "2026-03-08 15:00:00",
    "fastf1_version": "3.8.3",
    "pipeline_version": "2.0.0",
    "ingested_at": pd.Timestamp.utcnow().isoformat(),
}])
write_table(meta_df, "session_metadata", SESSION_ID)

# 2. 11 Teams, 22 Drivers
GRID = [
    ("McLaren", "PIA", 81, 1),
    ("McLaren", "NOR", 4, 2),
    ("Ferrari", "LEC", 16, 3),
    ("Ferrari", "HAM", 44, 4),
    ("Mercedes", "RUS", 63, 5),
    ("Mercedes", "ANT", 12, 6),
    ("Red Bull Racing", "VER", 1, 7),
    ("Red Bull Racing", "LAW", 30, 8),
    ("Aston Martin", "ALO", 14, 9),
    ("Aston Martin", "STR", 18, 10),
    ("Williams", "ALB", 23, 11),
    ("Williams", "SAI", 55, 12),
    ("Alpine", "GAS", 10, 13),
    ("Alpine", "DOO", 7, 14),
    ("Racing Bulls", "TSU", 22, 15),
    ("Racing Bulls", "HAD", 6, 16),
    ("Haas F1 Team", "BEA", 87, 17),
    ("Haas F1 Team", "OCO", 31, 18),
    ("Audi", "HUL", 27, 19),
    ("Audi", "BOR", 5, 20),
    ("Cadillac", "BOT", 77, 21),
    ("Cadillac", "PER", 11, 22),
]

TOTAL_LAPS = 58
laps_rows = []
np.random.seed(42)

for team, drv, num, grid_pos in GRID:
    # 2-stop strategy: Stint 1 (Medium, laps 1-18), Stint 2 (Hard, laps 19-40), Stint 3 (Medium, laps 41-58)
    base_pace = 80.5 + (grid_pos * 0.12)
    current_gap = (grid_pos - 1) * 1.4
    
    for lap in range(1, TOTAL_LAPS + 1):
        if lap <= 18:
            stint = 1
            compound = "MEDIUM"
            tyre_life = lap
            deg = 0.045 * tyre_life
        elif lap <= 40:
            stint = 2
            compound = "HARD"
            tyre_life = lap - 18
            deg = 0.026 * tyre_life
        else:
            stint = 3
            compound = "MEDIUM"
            tyre_life = lap - 40
            deg = 0.048 * tyre_life
            
        fuel_correction = (TOTAL_LAPS - lap) * 0.035
        noise = np.random.normal(0, 0.18)
        lap_time = base_pace + deg - fuel_correction + noise
        
        is_pit = lap in [18, 40]
        if is_pit:
            lap_time += 21.5  # pit loss
            
        run_type = "long_run"
        laps_rows.append({
            "session_id": SESSION_ID,
            "driver": drv,
            "team": team,
            "lap_number": lap,
            "stint": stint,
            "compound": compound,
            "tyre_life": tyre_life,
            "fresh_tyre": tyre_life == 1,
            "lap_time_s": round(float(lap_time), 3),
            "speed_trap_kmh": round(320.0 - (grid_pos * 0.8) + np.random.uniform(-3, 3), 1),
            "track_status": "1",
            "is_accurate": True,
            "deleted": False,
            "pit_out": lap in [19, 41],
            "pit_in": is_pit,
            "run_type": run_type,
            "air_temp": 24.5,
            "track_temp": 38.2,
            "humidity": 45.0,
            "wind_speed": 3.2,
        })

laps_df = pd.DataFrame(laps_rows)
write_table(laps_df, "laps", SESSION_ID)

# 3. Corner Metrics (T1 through T14)
CORNERS = [f"T{i}" for i in range(1, 15)]
corner_rows = []

for team, drv, num, pos in GRID:
    for idx, c in enumerate(CORNERS):
        base_apex = 175.0 - (idx * 5.2) + np.random.uniform(-3, 3)
        brake_dist = 85.0 + (idx * 4.0) + (pos * 0.8)
        pickup_dist = 65.0 + (idx * 3.5)
        
        corner_rows.append({
            "session_id": SESSION_ID,
            "team": team,
            "driver": drv,
            "corner": c,
            "corner_order": idx + 1,
            "run_type": "long_run",
            "n_laps": 52,
            "brake_before_corner_m": round(brake_dist, 1),
            "brake_before_corner_iqr_m": round(np.random.uniform(2.5, 4.5), 1),
            "min_speed_kmh": round(base_apex, 1),
            "min_speed_iqr_kmh": round(np.random.uniform(1.8, 3.2), 1),
            "full_throttle_after_corner_m": round(pickup_dist, 1),
            "full_throttle_iqr_m": round(np.random.uniform(2.0, 4.0), 1),
            "brake_to_full_throttle_m": round(brake_dist + pickup_dist, 1),
            "peak_decel_g_est": round(4.8 - (idx * 0.1), 2),
            "dwell_ratio": round(np.random.uniform(0.18, 0.32), 3),
            "corner_style": "V-style" if idx in [0, 2, 8, 12] else "U-style",
        })

corners_df = pd.DataFrame(corner_rows)
write_table(corners_df, "corner_metrics", SESSION_ID)

# 4. Segment Deltas
seg_rows = []
for team_name in set(t[0] for t in GRID):
    team_drvs = [d[1] for d in GRID if d[0] == team_name]
    if len(team_drvs) == 2:
        d_a, d_b = team_drvs
        for c_idx in range(len(CORNERS) - 1):
            seg_name = f"{CORNERS[c_idx]}-{CORNERS[c_idx+1]}"
            delta = float(np.random.normal(0.04, 0.08))
            ci_spread = float(np.random.uniform(0.02, 0.05))
            ci_low = delta - ci_spread
            ci_high = delta + ci_spread
            sig = (ci_low > 0) or (ci_high < 0)
            
            seg_rows.append({
                "session_id": SESSION_ID,
                "team": team_name,
                "driver_a": d_a,
                "driver_b": d_b,
                "segment": seg_name,
                "run_type": "long_run",
                "delta_s": round(delta, 3),
                "ci_low_s": round(ci_low, 3),
                "ci_high_s": round(ci_high, 3),
                "n_a": 52,
                "n_b": 51,
                "significant": bool(sig),
            })

seg_df = pd.DataFrame(seg_rows)
write_table(seg_df, "segment_deltas", SESSION_ID)

# 5. Tyre Stints (Theil-Sen Degradation)
tyre_rows = []
for team, drv, num, pos in GRID:
    # Stint 1 Medium
    tyre_rows.append({
        "session_id": SESSION_ID,
        "team": team,
        "driver": drv,
        "compound": "MEDIUM",
        "tyre_life_start": 1,
        "n_laps_used": 18,
        "base_pace_s": round(80.2 + (pos * 0.1), 3),
        "deg_s_per_lap": round(float(np.random.uniform(0.042, 0.055)), 3),
        "deg_ci_low": 0.038,
        "deg_ci_high": 0.062,
        "residual_std_s": 0.16,
        "fuel_kg_per_lap": 1.2,
        "fuel_s_per_kg": 0.03,
    })
    # Stint 2 Hard
    tyre_rows.append({
        "session_id": SESSION_ID,
        "team": team,
        "driver": drv,
        "compound": "HARD",
        "tyre_life_start": 1,
        "n_laps_used": 22,
        "base_pace_s": round(80.8 + (pos * 0.1), 3),
        "deg_s_per_lap": round(float(np.random.uniform(0.024, 0.032)), 3),
        "deg_ci_low": 0.020,
        "deg_ci_high": 0.036,
        "residual_std_s": 0.14,
        "fuel_kg_per_lap": 1.2,
        "fuel_s_per_kg": 0.03,
    })

tyre_df = pd.DataFrame(tyre_rows)
write_table(tyre_df, "tyre_stints", SESSION_ID)

# 6. Energy Signature (2026 Straight-Line Clipping)
energy_rows = []
for team, drv, num, pos in GRID:
    for straight in ["start_straight", "straight_after_T2", "straight_after_T8", "straight_after_T10"]:
        is_clip_team = team in ["Williams", "Aston Martin", "Cadillac", "Audi"]
        clip_flag = is_clip_team and straight in ["straight_after_T8", "start_straight"]
        v_peak = round(float(322.0 - (pos * 0.7) + np.random.uniform(-2, 2)), 1)
        late_loss = round(float(np.random.uniform(9.0, 14.5) if clip_flag else np.random.uniform(1.0, 3.5)), 1)
        
        energy_rows.append({
            "session_id": SESSION_ID,
            "team": team,
            "driver": drv,
            "straight": straight,
            "run_type": "long_run",
            "n_laps": 52,
            "v_peak_kmh": v_peak,
            "v_end_kmh": round(v_peak - late_loss, 1),
            "peak_at_frac": 0.72 if clip_flag else 0.94,
            "late_loss_kmh": late_loss,
            "clipping_flag": bool(clip_flag),
        })

energy_df = pd.DataFrame(energy_rows)
write_table(energy_df, "energy_signature", SESSION_ID)

# 7. Session Highlights (Post-Race Debrief)
highlights_rows = [
    {
        "session_id": SESSION_ID,
        "team": "McLaren",
        "driver": "PIA",
        "headline": "PIA: Dominant Australian GP victory from pole.",
        "primary_time_loss": "0.08 s in T9-T10",
        "primary_time_gain": "0.19 s in start-T1",
        "team_summary": "McLaren executed a clinical 2-stop Medium-Hard-Medium strategy, clinching a 1-2 finish.",
        "setup_hypotheses": "Front wing angle +0.5 deg provided superior rotation without tyre overheating.",
        "grounded": True,
        "model": "qwen3.5:4b",
    },
    {
        "session_id": SESSION_ID,
        "team": "McLaren",
        "driver": "NOR",
        "headline": "NOR: P2 podium finish, closing within 2.1s of Piastri.",
        "primary_time_loss": "0.19 s in start-T1",
        "primary_time_gain": "0.11 s in T11-T12",
        "team_summary": "McLaren executed a clinical 2-stop Medium-Hard-Medium strategy, clinching a 1-2 finish.",
        "setup_hypotheses": "Differential entry preload reduced low-speed understeer.",
        "grounded": True,
        "model": "qwen3.5:4b",
    },
    {
        "session_id": SESSION_ID,
        "team": "Ferrari",
        "driver": "LEC",
        "headline": "LEC: P3 podium finish, strong middle stint pace.",
        "primary_time_loss": "0.12 s in T3-T4",
        "primary_time_gain": "0.14 s in T13-T14",
        "team_summary": "Ferrari secured P3 and P4 with consistent degradation on the Hard compound.",
        "setup_hypotheses": "Stiffened rear anti-roll bar maximized high-speed stability through T9-T10.",
        "grounded": True,
        "model": "qwen3.5:4b",
    },
    {
        "session_id": SESSION_ID,
        "team": "Ferrari",
        "driver": "HAM",
        "headline": "HAM: P4 on Ferrari debut, impressive tyre management.",
        "primary_time_loss": "0.14 s in T13-T14",
        "primary_time_gain": "0.09 s in T1-T2",
        "team_summary": "Ferrari secured P3 and P4 with consistent degradation on the Hard compound.",
        "setup_hypotheses": "Brake bias migrated 1% forward stabilized heavy braking into T1.",
        "grounded": True,
        "model": "qwen3.5:4b",
    },
    {
        "session_id": SESSION_ID,
        "team": "Mercedes",
        "driver": "RUS",
        "headline": "RUS: P5 finish, battling battery derate on the main straight.",
        "primary_time_loss": "0.15 s in start-T1",
        "primary_time_gain": "0.08 s in T6-T7",
        "team_summary": "Mercedes maximized points with Russell P5 and Antonelli P6 on debut.",
        "setup_hypotheses": "Softer front heave spring improved kerb riding in chicane.",
        "grounded": True,
        "model": "qwen3.5:4b",
    },
    {
        "session_id": SESSION_ID,
        "team": "Mercedes",
        "driver": "ANT",
        "headline": "ANT: P6 points finish on Formula 1 Grand Prix debut.",
        "primary_time_loss": "0.12 s in T1-T2",
        "primary_time_gain": "0.07 s in T11-T12",
        "team_summary": "Mercedes maximized points with Russell P5 and Antonelli P6 on debut.",
        "setup_hypotheses": "Throttle mapping adjusted to curve 2 improved traction out of slow corners.",
        "grounded": True,
        "model": "qwen3.5:4b",
    },
]

highlights_df = pd.DataFrame(highlights_rows)
write_table(highlights_df, "session_highlights", SESSION_ID)
print(f"Successfully generated full race data for {SESSION_ID} across all 7 tables!")
