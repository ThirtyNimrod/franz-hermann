"""Track segment times between consecutive corners and bootstrap teammate deltas."""
import numpy as np
import pandas as pd


def segment_times(tel: pd.DataFrame, anchors: dict[str, float]) -> pd.Series:
    """Seconds spent between consecutive corner anchors on one lap."""
    if not anchors:
        return pd.Series(dtype=float)
    names = sorted(anchors, key=anchors.get)
    d = tel["Distance"].to_numpy(float)
    if hasattr(tel["Time"], "dt"):
        t = tel["Time"].dt.total_seconds().to_numpy()
    else:
        t = tel["Time"].to_numpy(float)
    marks = [0.0] + [anchors[n] for n in names] + [d[-1]]
    labels = (
        [f"start-{names[0]}"]
        + [f"{a}-{b}" for a, b in zip(names, names[1:])]
        + [f"{names[-1]}-finish"]
    )
    return pd.Series(np.diff(np.interp(marks, d, t)), index=labels)


def teammate_deltas(
    seg_a: pd.DataFrame,
    seg_b: pd.DataFrame,
    n_boot: int = 2000,
    seed: int = 0,
) -> pd.DataFrame:
    """Compute bootstrap teammate deltas per segment (seg_a / seg_b: laps x segments, delta = A - B)."""
    rng = np.random.default_rng(seed)
    rows = []
    common_cols = [c for c in seg_a.columns if c in seg_b.columns]
    for order, seg in enumerate(common_cols):
        a = seg_a[seg].dropna().to_numpy(float)
        b = seg_b[seg].dropna().to_numpy(float)
        if len(a) < 2 or len(b) < 2:
            continue
        boot = np.median(rng.choice(a, (n_boot, len(a))), axis=1) - np.median(
            rng.choice(b, (n_boot, len(b))), axis=1
        )
        lo, hi = np.percentile(boot, [5, 95])
        rows.append({
            "segment": seg,
            "segment_order": order,
            "delta_s": float(np.median(a) - np.median(b)),
            "ci_low_s": float(lo),
            "ci_high_s": float(hi),
            "n_a": len(a),
            "n_b": len(b),
            "significant": bool(lo > 0 or hi < 0),
        })
    return pd.DataFrame(rows)
