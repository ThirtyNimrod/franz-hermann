"""2026 straight-line speed shape and electrical energy clipping detection."""
import numpy as np
import pandas as pd

from f1_ai import config as C


def straight_signature(
    tel: pd.DataFrame,
    start_m: float,
    end_m: float,
) -> dict | None:
    """Analyze speed trace shape during full throttle on a straight."""
    seg = tel[(tel["Distance"] >= start_m) & (tel["Distance"] <= end_m)]
    full = seg[seg["Throttle"] >= C.FULL_THROTTLE]
    if len(full) < 5:
        return None
    v = full["Speed"].to_numpy(float)
    d = full["Distance"].to_numpy(float)
    i_peak = int(np.argmax(v))
    peak_at_frac = float((d[i_peak] - d[0]) / max(d[-1] - d[0], 1.0))
    late_loss_kmh = float(v[i_peak] - v[-1])
    clipping_flag = bool(late_loss_kmh >= 4.0 and peak_at_frac < 0.85)

    return {
        "v_start_kmh": float(v[0]),
        "v_peak_kmh": float(v[i_peak]),
        "v_end_kmh": float(v[-1]),
        "peak_at_frac": peak_at_frac,
        "late_loss_kmh": late_loss_kmh,
        "clipping_flag": clipping_flag,
    }
