"""Lap classification: push, long_run, out_in, cooldown, invalid, other."""
import numpy as np
import pandas as pd

from f1_ai import config as C


def classify_laps(laps: pd.DataFrame) -> pd.DataFrame:
    """Classify laps into run_type ensuring like-for-like comparisons."""
    df = laps.sort_values(["driver", "lap_number"]).copy()

    green = ~df["track_status"].fillna("").astype(str).str.contains("[2-7]")  # yellow/SC/VSC/red
    valid = df["lap_time_s"].notna() & df["is_accurate"] & ~df["deleted"] & green
    df["run_type"] = np.where(
        df["pit_in"] | df["pit_out"],
        "out_in",
        np.where(valid, "other", "invalid"),
    )

    # A run is the set of consecutive laps between two pit exits
    run_no = df["pit_out"].astype(int).groupby(df["driver"]).cumsum()
    df["run_id"] = df["driver"] + "_" + run_no.astype(str)

    best = df.loc[valid, ["driver", "lap_time_s"]].groupby("driver")["lap_time_s"].min()
    df["pct_of_best"] = df["lap_time_s"] / df["driver"].map(best)

    # Long runs: at least N laps within a narrow band of the run's median
    for _, run in df[df["run_type"] == "other"].groupby("run_id"):
        median = run["lap_time_s"].median()
        in_band = (run["lap_time_s"] - median).abs() <= C.LONG_RUN_BAND * median
        if in_band.sum() >= C.LONG_RUN_MIN_LAPS:
            df.loc[run.index[in_band], "run_type"] = "long_run"

    rest = df["run_type"] == "other"
    df.loc[rest & (df["pct_of_best"] <= C.PUSH_THRESHOLD), "run_type"] = "push"
    df.loc[rest & (df["pct_of_best"] >= C.COOLDOWN_THRESHOLD), "run_type"] = "cooldown"
    return df
