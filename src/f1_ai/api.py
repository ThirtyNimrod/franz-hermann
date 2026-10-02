"""FastAPI backend server for the Formula 1 AI Race Engineer Nothing UI."""
from __future__ import annotations

import logging
from typing import Any, Literal
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from f1_ai.config import CHAT_MODEL
from f1_ai.harness.agent import ask
from f1_ai.store.duck import TABLES, connect

logger = logging.getLogger("f1_ai.api")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="F1 AI Race Engineer API",
    description="High-speed telemetry analytics and grounded AI race engineer API",
    version="2.0.0",
)

# CORS enabled for Vite dev server (localhost:5173) and production frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _query(sql: str, params: list | None = None) -> list[dict[str, Any]]:
    with connect() as con:
        cur = con.execute(sql, params or [])
        if not cur.description:
            return []
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


class ChatRequest(BaseModel):
    question: str
    session_id: str | None = None
    model: str | None = None


class ChatResponse(BaseModel):
    reply: str
    model: str
    grounded: bool = True


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Health check verifying DuckDB store views."""
    available_tables = []
    with connect() as con:
        for t in TABLES:
            try:
                con.execute(f"SELECT 1 FROM {t} LIMIT 1")
                available_tables.append(t)
            except Exception:
                pass
    return {"status": "ok", "tables": available_tables}


@app.get("/api/sessions")
def list_sessions(year: int | None = None) -> list[dict[str, Any]]:
    """List available ingested sessions."""
    sql = "SELECT session_id, year, round, event_name, session_type, session_date FROM session_metadata"
    if year is not None:
        return _query(sql + " WHERE year = ? ORDER BY session_date DESC", [year])
    return _query(sql + " ORDER BY session_date DESC")


@app.get("/api/sessions/{session_id}/drivers")
def list_drivers(session_id: str) -> dict[str, Any]:
    """List teams, drivers, and lap counts for a session."""
    rows = _query(
        "SELECT team, driver, run_type, count(*) AS laps FROM laps "
        "WHERE session_id = ? GROUP BY ALL ORDER BY team, driver, run_type",
        [session_id],
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"No lap data found for session '{session_id}'")

    # Aggregate into distinct teams with drivers
    teams_dict: dict[str, dict[str, Any]] = {}
    for r in rows:
        team_name = r["team"]
        if team_name not in teams_dict:
            teams_dict[team_name] = {"team": team_name, "drivers": set(), "total_laps": 0}
        teams_dict[team_name]["drivers"].add(r["driver"])
        teams_dict[team_name]["total_laps"] += r["laps"]

    teams = [
        {"team": k, "drivers": sorted(list(v["drivers"])), "total_laps": v["total_laps"]}
        for k, v in sorted(teams_dict.items())
    ]
    return {"session_id": session_id, "teams": teams, "details": rows}


@app.get("/api/sessions/{session_id}/corners")
def list_corners(session_id: str) -> list[str]:
    """List ordered track corner markers for a session."""
    rows = _query(
        "SELECT DISTINCT corner, corner_order FROM corner_metrics "
        "WHERE session_id = ? ORDER BY corner_order",
        [session_id],
    )
    return [r["corner"] for r in rows]


@app.get("/api/sessions/{session_id}/highlights")
def get_highlights(session_id: str, driver: str | None = None) -> list[dict[str, Any]]:
    """Stored post-session debrief summary and setup hypotheses."""
    sql = (
        "SELECT team, driver, headline, primary_time_loss, primary_time_gain, team_summary, "
        "setup_hypotheses, grounded, model FROM session_highlights WHERE session_id = ?"
    )
    params: list[Any] = [session_id]
    if driver:
        sql += " AND driver = ?"
        params.append(driver.upper())
    return _query(sql + " ORDER BY team, driver", params)


@app.get("/api/sessions/{session_id}/corners/compare")
def compare_corners(
    session_id: str,
    team: str,
    corner: str,
    run_type: Literal["push", "long_run"] = "push",
) -> list[dict[str, Any]]:
    """Braking point, minimum apex speed, throttle pick-up, and style comparison for team drivers."""
    rows = _query(
        """
        SELECT driver, team, corner, run_type, n_laps,
               brake_before_corner_m, brake_before_corner_iqr_m,
               min_speed_kmh, min_speed_iqr_kmh,
               full_throttle_after_corner_m, full_throttle_iqr_m,
               brake_to_full_throttle_m, peak_decel_g_est, corner_style
        FROM corner_metrics
        WHERE session_id = ? AND team ILIKE ? AND corner = ? AND run_type = ?
        ORDER BY driver""",
        [session_id, f"%{team}%", corner.upper(), run_type],
    )
    return rows


@app.get("/api/sessions/{session_id}/segments")
def get_segment_deltas(
    session_id: str,
    team: str,
    run_type: Literal["push", "long_run"] = "push",
    only_significant: bool = False,
) -> list[dict[str, Any]]:
    """Segment deltas between teammates with 90% confidence intervals."""
    sql = (
        "SELECT driver_a, driver_b, segment, delta_s, ci_low_s, ci_high_s, n_a, n_b, significant "
        "FROM segment_deltas WHERE session_id = ? AND team ILIKE ? AND run_type = ?"
    )
    if only_significant:
        sql += " AND significant"
    return _query(sql + " ORDER BY abs(delta_s) DESC", [session_id, f"%{team}%", run_type])


@app.get("/api/sessions/{session_id}/tyre")
def query_tyre(
    session_id: str,
    compound: str | None = None,
    driver: str | None = None,
) -> list[dict[str, Any]]:
    """Fuel-corrected Theil-Sen degradation slopes and baseline pace."""
    sql = (
        "SELECT driver, team, compound, tyre_life_start, n_laps_used, base_pace_s, deg_s_per_lap, "
        "deg_ci_low, deg_ci_high, residual_std_s, fuel_kg_per_lap, fuel_s_per_kg "
        "FROM tyre_stints WHERE session_id = ?"
    )
    params: list[Any] = [session_id]
    if compound:
        sql += " AND compound = ?"
        params.append(compound.upper())
    if driver:
        sql += " AND driver = ?"
        params.append(driver.upper())
    return _query(sql + " ORDER BY compound, deg_s_per_lap", params)


@app.get("/api/sessions/{session_id}/energy")
def get_energy(session_id: str, team: str | None = None) -> list[dict[str, Any]]:
    """2026 straight-line speed shape and electrical energy deployment clipping signature."""
    sql = (
        "SELECT driver, team, straight, run_type, n_laps, v_peak_kmh, v_end_kmh, peak_at_frac, "
        "late_loss_kmh, clipping_flag FROM energy_signature WHERE session_id = ?"
    )
    params: list[Any] = [session_id]
    if team:
        sql += " AND team ILIKE ?"
        params.append(f"%{team}%")
    return _query(sql + " ORDER BY straight, driver", params)


@app.post("/api/chat", response_model=ChatResponse)
async def chat_intercom(req: ChatRequest) -> ChatResponse:
    """Send an ad-hoc question to the local AI Race Engineer agent."""
    model = req.model or CHAT_MODEL
    # Prepend context if session_id is provided
    prompt = req.question
    if req.session_id and req.session_id not in prompt:
        prompt = f"In session {req.session_id}: {prompt}"

    try:
        reply = await ask(prompt, model=model, max_steps=5)
        return ChatResponse(reply=reply, model=model, grounded=True)
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return ChatResponse(
            reply=f"[AI INTERCOM OFFLINE] Error communicating with local model: {str(e)}",
            model=model,
            grounded=False,
        )
