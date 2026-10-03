"""F1 race engineer MCP server: read-only tools over the Parquet store."""
from __future__ import annotations

import logging
import os
import re
import sys
from typing import Literal

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from f1_ai.store.duck import TABLES, connect

logging.basicConfig(stream=sys.stderr, level=logging.INFO)  # stdout belongs to stdio protocol
mcp = FastMCP("f1_mcp")
RO = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)

RunType = Literal["push", "long_run"]
Compound = Literal["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]


def _rows(sql: str, params: list | None = None) -> list[dict]:
    with connect() as con:
        cur = con.execute(sql, params or [])
        if not cur.description:
            return []
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def _require_session(session_id: str) -> None:
    if not _rows("SELECT 1 FROM session_metadata WHERE session_id = ?", [session_id]):
        raise ValueError(f"Unknown session_id '{session_id}'. Call f1_list_sessions for valid ids.")


def _nonempty(rows: list[dict], hint: str) -> list[dict]:
    if not rows:
        raise ValueError(f"No matching rows. {hint}")
    return rows


@mcp.tool(annotations=RO)
def f1_list_sessions(year: int | None = None) -> list[dict]:
    """List ingested sessions. Call this first to get valid session_id values
    (format '<year>_<round>_<session>', e.g. '2026_16_FP2')."""
    sql = "SELECT session_id, year, round, event_name, session_type, session_date FROM session_metadata"
    if year is not None:
        return _rows(sql + " WHERE year = ? ORDER BY session_date", [year])
    return _rows(sql + " ORDER BY session_date")


@mcp.tool(annotations=RO)
def f1_list_drivers(session_id: str) -> list[dict]:
    """Drivers (3-letter codes) and teams in a session, with lap counts per run_type."""
    _require_session(session_id)
    return _rows(
        "SELECT team, driver, run_type, count(*) AS laps FROM laps "
        "WHERE session_id = ? GROUP BY ALL ORDER BY team, driver, run_type",
        [session_id],
    )


@mcp.tool(annotations=RO)
def f1_list_corners(session_id: str) -> list[str]:
    """Corner labels available for a session, in track order (e.g. 'T1', 'T2', ...)."""
    _require_session(session_id)
    rows = _rows(
        "SELECT DISTINCT corner FROM corner_metrics WHERE session_id = ?",
        [session_id],
    )
    def _corner_sort_key(c: str) -> tuple[int, str]:
        match = re.search(r"\d+", c)
        num = int(match.group()) if match else 999
        return (num, c)

    return sorted([r["corner"] for r in rows], key=_corner_sort_key)


@mcp.tool(annotations=RO)
def f1_get_session_highlights(session_id: str, driver: str | None = None) -> list[dict]:
    """Stored post-session debrief for a session, optionally one driver (3-letter code, e.g. 'NOR').
    'grounded' is false when the text came from the deterministic fallback."""
    _require_session(session_id)
    sql = (
        "SELECT team, driver, headline, primary_time_loss, primary_time_gain, team_summary, "
        "setup_hypotheses, grounded, model FROM session_highlights WHERE session_id = ?"
    )
    params: list = [session_id]
    if driver:
        sql += " AND driver = ?"
        params.append(driver.upper())
    return _nonempty(_rows(sql, params), "Run the debrief pipeline for this session first.")


@mcp.tool(annotations=RO)
def f1_compare_teammates_corner(
    session_id: str,
    team: str,
    corner: str,
    run_type: RunType = "push",
) -> list[dict]:
    """Braking point, minimum speed and throttle pick-up for both drivers of a team at one corner.
    corner: a label from f1_list_corners. Distances are metres relative to the corner marker
    (brake_before_corner_m = how far before the marker braking starts). Values are medians over
    n_laps comparable laps, with IQR spreads; differences smaller than the spread are noise."""
    _require_session(session_id)
    rows = _rows(
        """
        SELECT driver, team, corner, run_type, n_laps,
               brake_before_corner_m, brake_before_corner_iqr_m,
               min_speed_kmh, min_speed_iqr_kmh, full_throttle_after_corner_m, full_throttle_iqr_m,
               brake_to_full_throttle_m, peak_decel_g_est, corner_style
        FROM corner_metrics
        WHERE session_id = ? AND team ILIKE ? AND corner = ? AND run_type = ?
        ORDER BY driver""",
        [session_id, f"%{team}%", corner.upper(), run_type],
    )
    return _nonempty(
        rows,
        "Check the team with f1_list_drivers and the corner with f1_list_corners, "
        "or try run_type='long_run'.",
    )


@mcp.tool(annotations=RO)
def f1_get_segment_deltas(
    session_id: str,
    team: str,
    run_type: RunType = "push",
    only_significant: bool = True,
) -> list[dict]:
    """Where time is gained or lost between teammates, per segment between corner markers.
    delta_s = driver_a minus driver_b in seconds (positive = driver_a slower), with a 90% interval.
    Sorted by size. Use this to find WHERE time goes; use f1_compare_teammates_corner for WHY."""
    _require_session(session_id)
    sql = (
        "SELECT driver_a, driver_b, segment, delta_s, ci_low_s, ci_high_s, n_a, n_b, significant "
        "FROM segment_deltas WHERE session_id = ? AND team ILIKE ? AND run_type = ?"
    )
    if only_significant:
        sql += " AND significant"
    rows = _rows(sql + " ORDER BY abs(delta_s) DESC", [session_id, f"%{team}%", run_type])
    return _nonempty(rows, "Try only_significant=false or run_type='long_run'.")


@mcp.tool(annotations=RO)
def f1_query_tyre_degradation(
    session_id: str,
    compound: Compound | None = None,
    driver: str | None = None,
) -> list[dict]:
    """Fuel-corrected degradation per long run: deg_s_per_lap (seconds lost per lap of tyre age,
    90% interval), base_pace_s, n_laps_used, residual_std_s. The fuel model used is included;
    the slope depends directly on it. Base pace across teams is confounded by unknown fuel loads."""
    _require_session(session_id)
    sql = (
        "SELECT driver, team, compound, tyre_life_start, n_laps_used, base_pace_s, deg_s_per_lap, "
        "deg_ci_low, deg_ci_high, residual_std_s, fuel_kg_per_lap, fuel_s_per_kg "
        "FROM tyre_stints WHERE session_id = ?"
    )
    params: list = [session_id]
    if compound:
        sql += " AND compound = ?"
        params.append(compound)
    if driver:
        sql += " AND driver = ?"
        params.append(driver.upper())
    return _nonempty(
        _rows(sql + " ORDER BY compound, deg_s_per_lap", params),
        "No long runs matched; check f1_list_drivers for long_run lap counts.",
    )


@mcp.tool(annotations=RO)
def f1_get_energy_signature(session_id: str, team: str) -> list[dict]:
    """2026 straight-line speed shape per straight. late_loss_kmh = speed lost while still at full
    throttle before braking; high values (clipping_flag) point to energy running out, not drag."""
    _require_session(session_id)
    rows = _rows(
        "SELECT driver, straight, run_type, n_laps, v_peak_kmh, v_end_kmh, peak_at_frac, "
        "late_loss_kmh, clipping_flag FROM energy_signature "
        "WHERE session_id = ? AND team ILIKE ? ORDER BY straight, driver",
        [session_id, f"%{team}%"],
    )
    return _nonempty(rows, "Check the team name with f1_list_drivers.")


@mcp.resource("f1://schema")
def f1_schema() -> str:
    """Column names and types of every view, for clients that write SQL."""
    with connect() as con:
        parts = []
        for t in TABLES:
            try:
                cols = con.execute(f"DESCRIBE {t}").fetchall()
            except Exception:
                continue
            parts.append(f"{t}: " + ", ".join(f"{c[0]} {c[1]}" for c in cols))
        return "\n".join(parts)


if os.environ.get("F1_MCP_ENABLE_SQL") == "1":  # opt-in; best with strong cloud models

    @mcp.tool(annotations=RO)
    def f1_run_sql(query: str, limit: int = 200) -> list[dict]:
        """Read-only DuckDB SQL over the views listed in resource f1://schema.
        One SELECT or WITH statement; results are capped at `limit` rows (max 1000)."""
        q = query.strip().rstrip(";")
        if ";" in q or not re.match(r"(?is)^\s*(select|with)\b", q):
            raise ValueError("Only a single SELECT or WITH statement is allowed.")
        return _rows(f"SELECT * FROM ({q}) LIMIT {max(1, min(int(limit), 1000))}")


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
