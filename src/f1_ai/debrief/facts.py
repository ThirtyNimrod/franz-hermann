"""Fact sheet generator per team from DuckDB views."""
from typing import Any


def build_facts(con, session_id: str, team: str, max_facts: int = 40) -> list[dict[str, Any]]:
    """Build a compact, unit-labelled fact sheet for one team."""
    facts: list[dict[str, Any]] = []

    # 1. Segment deltas (push laps, significant)
    try:
        cur = con.execute(
            """
            SELECT segment, driver_a, driver_b, delta_s, n_a, n_b FROM segment_deltas
            WHERE session_id = ? AND team ILIKE ? AND run_type = 'push' AND significant
            ORDER BY abs(delta_s) DESC LIMIT 6""",
            [session_id, f"%{team}%"],
        )
        for seg, a, b, delta, n_a, n_b in cur.fetchall():
            faster, slower = (b, a) if delta > 0 else (a, b)
            facts.append({
                "key": f"seg.{seg}",
                "value": round(abs(delta), 3),
                "unit": "s",
                "faster": faster,
                "slower": slower,
                "laps": [n_a, n_b],
            })
    except Exception:
        pass

    # 2. Corner metrics differences: only where |median_A - median_B| > max(IQR_A, IQR_B)
    try:
        cur = con.execute(
            """
            SELECT corner, driver, brake_before_corner_m, brake_before_corner_iqr_m,
                   min_speed_kmh, min_speed_iqr_kmh, full_throttle_after_corner_m, full_throttle_iqr_m, n_laps
            FROM corner_metrics
            WHERE session_id = ? AND team ILIKE ? AND run_type = 'push'
            ORDER BY corner, driver""",
            [session_id, f"%{team}%"],
        )
        rows = cur.fetchall()
        by_corner: dict[str, list] = {}
        for r in rows:
            by_corner.setdefault(r[0], []).append(r)
        for corner, drv_rows in by_corner.items():
            if len(drv_rows) == 2:
                r1, r2 = drv_rows[0], drv_rows[1]
                d1, d2 = r1[1], r2[1]
                b1, b1_iqr, b2, b2_iqr = r1[2], r1[3], r2[2], r2[3]
                if b1 is not None and b2 is not None and b1_iqr is not None and b2_iqr is not None:
                    diff = abs(b1 - b2)
                    spread = max(b1_iqr, b2_iqr)
                    if diff > spread and spread > 0:
                        facts.append({
                            "key": f"corner.{corner}.brake_before_corner_m",
                            "value": round(diff, 1),
                            "unit": "m",
                            d1: round(b1, 1),
                            d2: round(b2, 1),
                            "laps": [r1[8], r2[8]],
                        })
                v1, v1_iqr, v2, v2_iqr = r1[4], r1[5], r2[4], r2[5]
                if v1 is not None and v2 is not None and v1_iqr is not None and v2_iqr is not None:
                    diff_v = abs(v1 - v2)
                    spread_v = max(v1_iqr, v2_iqr)
                    if diff_v > spread_v and spread_v > 0:
                        faster_d = d1 if v1 > v2 else d2
                        facts.append({
                            "key": f"corner.{corner}.min_speed_kmh",
                            "value": round(diff_v, 1),
                            "unit": "km/h",
                            "higher": faster_d,
                            d1: round(v1, 1),
                            d2: round(v2, 1),
                            "laps": [r1[8], r2[8]],
                        })
    except Exception:
        pass

    # 3. Tyre degradation facts: deg_s_per_lap per driver/compound
    try:
        cur = con.execute(
            """
            SELECT driver, compound, deg_s_per_lap, deg_ci_low, deg_ci_high, n_laps_used, fuel_kg_per_lap, fuel_s_per_kg
            FROM tyre_stints
            WHERE session_id = ? AND team ILIKE ?""",
            [session_id, f"%{team}%"],
        )
        for drv, comp, deg, lo, hi, n_used, f_kg, f_s in cur.fetchall():
            facts.append({
                "key": f"deg.{drv}.{comp}",
                "value": round(deg, 3),
                "unit": "s/lap",
                "ci": [round(lo, 3), round(hi, 3)],
                "n_laps_used": n_used,
            })
    except Exception:
        pass

    # 4. Energy facts: clipping flags and late_loss_kmh per straight
    try:
        cur = con.execute(
            """
            SELECT driver, straight, late_loss_kmh, clipping_flag
            FROM energy_signature
            WHERE session_id = ? AND team ILIKE ? AND (clipping_flag OR late_loss_kmh > 4.0)""",
            [session_id, f"%{team}%"],
        )
        for drv, straight, late_loss, clip in cur.fetchall():
            facts.append({
                "key": f"energy.{straight}.{drv}.late_loss_kmh",
                "value": round(late_loss, 1),
                "unit": "km/h",
                "clipping": bool(clip),
            })
    except Exception:
        pass

    # 5. Session context: track temp range
    try:
        cur = con.execute(
            """SELECT min(track_temp_c), max(track_temp_c) FROM laps WHERE session_id = ?""",
            [session_id],
        )
        row = cur.fetchone()
        if row and row[0] is not None and row[1] is not None:
            facts.append({
                "key": "context.track_temp_range_c",
                "value": round(row[1] - row[0], 1),
                "min": round(row[0], 1),
                "max": round(row[1], 1),
                "unit": "C",
            })
    except Exception:
        pass

    return facts[:max_facts]
