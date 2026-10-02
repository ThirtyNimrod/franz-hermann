"""Distance anchoring per corner using closest X/Y coordinates."""
import numpy as np
import pandas as pd


def corner_anchors(
    tel: pd.DataFrame,
    corners: pd.DataFrame,
    ref_lap_len_m: float,
    window_m: float = 300.0,
) -> dict[str, float]:
    """Distance (on this lap's own scale) where the car passes each corner marker."""
    xy = tel[["X", "Y"]].to_numpy(float)
    dist = tel["Distance"].to_numpy(float)
    scale = dist[-1] / ref_lap_len_m if ref_lap_len_m > 0 else 1.0
    anchors: dict[str, float] = {}
    for c in corners.itertuples():
        expected = c.Distance * scale
        idx = np.flatnonzero(np.abs(dist - expected) < window_m)  # avoids crossover legs (e.g. Suzuka)
        if idx.size == 0:
            continue
        d2 = (xy[idx, 0] - c.X) ** 2 + (xy[idx, 1] - c.Y) ** 2
        letter = c.Letter if isinstance(getattr(c, "Letter", None), str) and pd.notna(c.Letter) else ""
        corner_number = getattr(c, "Number", 0)
        anchors[f"T{corner_number}{letter}"] = float(dist[idx[np.argmin(d2)]])
    return anchors
