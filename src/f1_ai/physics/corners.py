"""Corner metrics: brake onset, apex minimum speed, full throttle pickup, dwell ratio."""
import numpy as np
import pandas as pd
from scipy.signal import savgol_filter

from f1_ai import config as C


def corner_metrics(
    tel: pd.DataFrame,
    anchor_m: float,
    prev_anchor_m: float,
    exit_window_m: float = 200.0,
) -> dict | None:
    """Compute braking, apex, and throttle pick-up metrics for a corner."""
    d = tel["Distance"].to_numpy(float)
    v = tel["Speed"].to_numpy(float)  # km/h
    thr = tel["Throttle"].to_numpy(float)
    brk = tel["Brake"].to_numpy(bool)

    if hasattr(tel["Time"], "dt"):
        t = tel["Time"].dt.total_seconds().to_numpy()
    else:
        t = tel["Time"].to_numpy(float)

    approach = np.flatnonzero((d >= max(prev_anchor_m, anchor_m - 600)) & (d <= anchor_m))
    braking = approach[brk[approach]]
    if braking.size == 0:
        return None  # flat-out or lift-only corner
    breaks = np.flatnonzero(np.diff(braking) > 1)
    onset = braking[breaks[-1] + 1] if breaks.size else braking[0]  # last braking block

    zone = np.flatnonzero((d >= d[onset]) & (d <= anchor_m + exit_window_m))
    if zone.size == 0:
        return None
    vmin_i = zone[np.argmin(v[zone])]

    full_i = None
    for i in range(vmin_i, len(d)):
        if thr[i] >= C.FULL_THROTTLE:
            j = min(np.searchsorted(t, t[i] + C.FULL_THROTTLE_HOLD_S), len(t) - 1)
            if (thr[i : j + 1] >= C.FULL_THROTTLE).all():
                full_i = i
                break

    window_length = min(7, len(v) if len(v) % 2 == 1 else len(v) - 1)
    if window_length >= 5:
        vs = savgol_filter(v / 3.6, window_length=window_length, polyorder=2)  # m/s, smoothed
    else:
        vs = v / 3.6

    decel = -np.gradient(vs, t)[onset : vmin_i + 1]
    near_min = zone[v[zone] <= v[vmin_i] + 5.0]
    span = (d[full_i] - d[onset]) if full_i is not None else np.nan

    dwell_ratio = (
        (d[near_min].max() - d[near_min].min()) / span if span and span > 0 else np.nan
    )
    corner_style = "U-style" if pd.notna(dwell_ratio) and dwell_ratio > 0.4 else "V-style"

    return {
        "brake_before_corner_m": float(anchor_m - d[onset]),
        "min_speed_kmh": float(v[vmin_i]),
        "min_speed_rel_m": float(d[vmin_i] - anchor_m),
        "full_throttle_after_corner_m": (
            float(d[full_i] - anchor_m) if full_i is not None else np.nan
        ),
        "brake_to_full_throttle_m": float(span) if pd.notna(span) else np.nan,
        "peak_decel_g_est": (
            float(decel.max() / 9.81) if decel.size and not np.isnan(decel.max()) else np.nan
        ),
        "dwell_ratio": float(dwell_ratio) if pd.notna(dwell_ratio) else np.nan,
        "corner_style": corner_style,
    }
