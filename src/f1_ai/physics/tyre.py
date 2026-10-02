"""Fuel-corrected tyre degradation estimation using Theil-Sen regression."""
import numpy as np
import pandas as pd
from scipy.stats import theilslopes

from f1_ai import config as C


def fit_degradation(
    run: pd.DataFrame,
    fuel_kg_per_lap: float = C.FUEL_KG_PER_LAP,
    fuel_s_per_kg: float = C.FUEL_S_PER_KG,
) -> dict | None:
    """One long run -> fuel-corrected degradation in seconds per lap of tyre age."""
    run = run.sort_values("lap_number")
    laps_into_run = np.arange(len(run))
    keep = laps_into_run >= C.WARMUP_LAPS
    if keep.sum() < C.LONG_RUN_MIN_LAPS:
        return None
    # Add back the time the car gained from burning fuel, so only tyre effects remain
    corrected = (
        run["lap_time_s"].to_numpy()[keep]
        + laps_into_run[keep] * fuel_kg_per_lap * fuel_s_per_kg
    )
    age = run["tyre_life"].to_numpy(float)[keep]  # TyreLife, not stint lap count
    if np.all(age == age[0]):
        return None
    slope, intercept, lo, hi = theilslopes(corrected, age, alpha=0.90)
    resid = corrected - (intercept + slope * age)
    return {
        "compound": str(run["compound"].iloc[0]),
        "tyre_life_start": float(run["tyre_life"].iloc[0]),
        "n_laps_total": len(run),
        "n_laps_used": int(keep.sum()),
        "base_pace_s": float(intercept + slope * age[0]),  # pace at the first used lap
        "deg_s_per_lap": float(slope),
        "deg_ci_low": float(lo),
        "deg_ci_high": float(hi),
        "residual_std_s": float(resid.std(ddof=1)) if len(resid) > 1 else 0.0,
        "fuel_kg_per_lap": fuel_kg_per_lap,
        "fuel_s_per_kg": fuel_s_per_kg,
        "method": "theil-sen",
    }
