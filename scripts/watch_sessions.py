"""Post-session poller for FastF1 schedule and automated ingestion/debrief pipeline."""
import datetime
import logging
import sys
import time

import fastf1
import pandas as pd

from f1_ai.debrief.pipeline import run_debrief_session
from f1_ai.ingest.fastf1_loader import laps_table, load_session, metadata_table, session_id_for
from f1_ai.ingest.lap_classifier import classify_laps
from f1_ai.physics.anchors import corner_anchors
from f1_ai.physics.corners import corner_metrics
from f1_ai.physics.energy import straight_signature
from f1_ai.physics.segments import segment_times, teammate_deltas
from f1_ai.physics.tyre import fit_degradation
from f1_ai.store.duck import connect
from f1_ai.store.parquet_store import write_table

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def process_session(year: int, round_num: int, session_kind: str) -> str:
    """Full deterministic ingestion & physics pipeline for one session."""
    sid = session_id_for(year, round_num, session_kind)
    logger.info(f"Ingesting {sid}...")
    s = load_session(year, round_num, session_kind)

    # 1. Metadata & Laps
    meta_df = metadata_table(s, sid)
    write_table(meta_df, "session_metadata", sid)

    raw_laps = laps_table(s, sid)
    classified = classify_laps(raw_laps)
    write_table(classified, "laps", sid)

    # 2. Physics & Telemetry
    circuit_info = s.get_circuit_info()
    corners_df = circuit_info.corners

    push_laps = classified[classified["run_type"] == "push"]
    ref_lap_len = 5000.0
    if not push_laps.empty:
        best_idx = push_laps["lap_time_s"].idxmin()
        best_lap = s.laps.loc[best_idx]
        try:
            best_tel = best_lap.get_telemetry()
            if not best_tel.empty and "Distance" in best_tel:
                ref_lap_len = float(best_tel["Distance"].iloc[-1])
        except Exception:
            pass

    # Corner anchoring & metrics
    corner_records = []
    seg_by_driver: dict[tuple, dict[str, list[float]]] = {}

    target_laps = classified[classified["run_type"].isin(["push", "long_run"])]
    for (driver, run_type), drv_laps in target_laps.groupby(["driver", "run_type"]):
        team = str(drv_laps["team"].iloc[0])
        drv_corner_metrics: dict[str, list[dict]] = {}

        for lap_idx in drv_laps.index:
            f1_lap = s.laps.loc[lap_idx]
            try:
                tel = f1_lap.get_telemetry()
            except Exception:
                continue
            if tel.empty or "Distance" not in tel or "X" not in tel:
                continue

            anchors = corner_anchors(tel, corners_df, ref_lap_len)
            if not anchors:
                continue

            # Record segment times
            st = segment_times(tel, anchors)
            for seg_name, t_val in st.items():
                seg_by_driver.setdefault((team, run_type, seg_name), {}).setdefault(driver, []).append(t_val)

            # Compute corner metrics
            anchor_names = sorted(anchors, key=anchors.get)
            for i, c_name in enumerate(anchor_names):
                prev_m = anchors[anchor_names[i - 1]] if i > 0 else 0.0
                curr_m = anchors[c_name]
                cm = corner_metrics(tel, curr_m, prev_m)
                if cm:
                    drv_corner_metrics.setdefault(c_name, []).append(cm)

        # Aggregate corner metrics per driver x corner x run_type
        for c_order, (c_name, metrics_list) in enumerate(drv_corner_metrics.items()):
            if not metrics_list:
                continue
            m_df = pd.DataFrame(metrics_list)
            corner_records.append({
                "session_id": sid,
                "driver": driver,
                "team": team,
                "corner": c_name,
                "corner_order": c_order,
                "run_type": run_type,
                "n_laps": len(m_df),
                "brake_before_corner_m": float(m_df["brake_before_corner_m"].median()),
                "brake_before_corner_iqr_m": float(
                    m_df["brake_before_corner_m"].quantile(0.75)
                    - m_df["brake_before_corner_m"].quantile(0.25)
                ),
                "min_speed_kmh": float(m_df["min_speed_kmh"].median()),
                "min_speed_iqr_kmh": float(
                    m_df["min_speed_kmh"].quantile(0.75) - m_df["min_speed_kmh"].quantile(0.25)
                ),
                "min_speed_rel_m": float(m_df["min_speed_rel_m"].median()),
                "full_throttle_after_corner_m": float(m_df["full_throttle_after_corner_m"].median()),
                "full_throttle_iqr_m": float(
                    m_df["full_throttle_after_corner_m"].quantile(0.75)
                    - m_df["full_throttle_after_corner_m"].quantile(0.25)
                ),
                "brake_to_full_throttle_m": float(m_df["brake_to_full_throttle_m"].median()),
                "peak_decel_g_est": float(m_df["peak_decel_g_est"].median()),
                "dwell_ratio": float(m_df["dwell_ratio"].median()),
                "corner_style": m_df["corner_style"].mode()[0] if not m_df["corner_style"].empty else "V-style",
            })

    if corner_records:
        write_table(pd.DataFrame(corner_records), "corner_metrics", sid)

    # 3. Teammate segment deltas
    seg_delta_records = []
    teams = classified["team"].dropna().unique()
    for team in teams:
        for run_type in ["push", "long_run"]:
            team_laps = classified[(classified["team"] == team) & (classified["run_type"] == run_type)]
            drivers = team_laps["driver"].unique()
            if len(drivers) == 2:
                da, db = drivers[0], drivers[1]
                seg_cols = {}
                for (t_name, r_type, s_name), drv_times in seg_by_driver.items():
                    if t_name == team and r_type == run_type:
                        if da in drv_times and db in drv_times:
                            seg_cols[s_name] = (drv_times[da], drv_times[db])
                if seg_cols:
                    df_a = pd.DataFrame({k: pd.Series(v[0], dtype=float) for k, v in seg_cols.items()})
                    df_b = pd.DataFrame({k: pd.Series(v[1], dtype=float) for k, v in seg_cols.items()})
                    deltas = teammate_deltas(df_a, df_b)
                    if not deltas.empty:
                        deltas["session_id"] = sid
                        deltas["team"] = team
                        deltas["driver_a"] = da
                        deltas["driver_b"] = db
                        deltas["run_type"] = run_type
                        seg_delta_records.append(deltas)

    if seg_delta_records:
        write_table(pd.concat(seg_delta_records, ignore_index=True), "segment_deltas", sid)

    # 4. Tyre degradation
    tyre_records = []
    for run_id, run_laps in classified[classified["run_type"] == "long_run"].groupby("run_id"):
        deg = fit_degradation(run_laps)
        if deg:
            deg["session_id"] = sid
            deg["run_id"] = run_id
            deg["driver"] = run_laps["driver"].iloc[0]
            deg["team"] = run_laps["team"].iloc[0]
            tyre_records.append(deg)

    if tyre_records:
        write_table(pd.DataFrame(tyre_records), "tyre_stints", sid)

    # 5. Energy signature
    energy_records = []
    for (driver, team, run_type), drv_laps in classified[classified["run_type"] == "push"].groupby(
        ["driver", "team", "run_type"]
    ):
        for lap_idx in drv_laps.index:
            f1_lap = s.laps.loc[lap_idx]
            try:
                tel = f1_lap.get_telemetry()
            except Exception:
                continue
            if tel.empty or "Distance" not in tel or "Speed" not in tel:
                continue
            anchors = corner_anchors(tel, corners_df, ref_lap_len)
            anchor_names = sorted(anchors, key=anchors.get)
            for i, c_name in enumerate(anchor_names):
                start_m = anchors[c_name]
                end_m = (
                    anchors[anchor_names[i + 1]]
                    if i + 1 < len(anchor_names)
                    else float(tel["Distance"].iloc[-1])
                )
                if end_m - start_m >= 400.0:
                    sig = straight_signature(tel, start_m, end_m)
                    if sig:
                        energy_records.append({
                            "session_id": sid,
                            "driver": driver,
                            "team": team,
                            "straight": f"after_{c_name}",
                            "run_type": run_type,
                            "n_laps": 1,
                            **sig,
                        })

    if energy_records:
        e_df = pd.DataFrame(energy_records)
        agg_e = (
            e_df.groupby(["session_id", "driver", "team", "straight", "run_type"])
            .agg({
                "v_start_kmh": "median",
                "v_peak_kmh": "median",
                "v_end_kmh": "median",
                "peak_at_frac": "median",
                "late_loss_kmh": "median",
                "clipping_flag": lambda x: bool(x.any()),
                "n_laps": "count",
            })
            .reset_index()
        )
        write_table(agg_e, "energy_signature", sid)

    logger.info(f"Pipeline completed for {sid}.")
    return sid


def poll_and_process():
    """Poll event schedule and process completed sessions."""
    current_year = datetime.datetime.now().year
    try:
        schedule = fastf1.get_event_schedule(current_year)
    except Exception as e:
        logger.error(f"Failed to fetch schedule: {e}")
        return

    con = connect()
    ingested = {
        r[0]
        for r in con.execute("SELECT session_id FROM session_metadata").fetchall()
    } if "session_metadata" in [t[0] for t in con.execute("SHOW TABLES").fetchall()] else set()

    for _, event in schedule.iterrows():
        round_num = event.RoundNumber
        if round_num == 0 or pd.isna(round_num):
            continue
        for session_kind in ["FP1", "FP2", "FP3", "SQ", "S", "Q", "R"]:
            sid = session_id_for(current_year, int(round_num), session_kind)
            if sid in ingested:
                continue
            try:
                process_session(current_year, int(round_num), session_kind)
                run_debrief_session(sid)
            except Exception as e:
                logger.warning(f"Could not process {sid} yet: {e}")


if __name__ == "__main__":
    if len(sys.argv) >= 4:
        y, r, k = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
        process_session(y, r, k)
        run_debrief_session(session_id_for(y, r, k))
    else:
        poll_and_process()
