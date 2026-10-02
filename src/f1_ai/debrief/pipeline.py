"""Post-session debrief synthesis pipeline with retries, grounding check, and fallback."""
import hashlib
import json
import sys
from pathlib import Path

import pandas as pd
from pydantic import ValidationError

from f1_ai.config import DEBRIEF_MODEL, PIPELINE_VERSION, REPORTS_DIR
from f1_ai.debrief.facts import build_facts
from f1_ai.debrief.grounding import grounding_problems
from f1_ai.debrief.schema import DriverHighlight, TeamDebrief
from f1_ai.llm.ollama_client import chat_json, ollama_version
from f1_ai.store.duck import connect
from f1_ai.store.parquet_store import write_table

SYSTEM = """You are an F1 performance engineer writing a short post-session debrief.
Use ONLY the facts provided. Every number you write must appear in the facts, with its unit.
Never calculate new numbers. Each driver gets a headline, a primary time loss and a primary time gain.
Setup ideas are optional, must start with "Hypothesis:", and must follow from the facts.
Reply with JSON that matches the schema."""


def fallback_debrief(team: str, facts: list[dict]) -> TeamDebrief:
    """Deterministic text so the pipeline never blocks on a bad model output."""
    seg = [f for f in facts if f["key"].startswith("seg.")]
    drivers = sorted({d for f in seg for d in (f.get("faster"), f.get("slower")) if d})
    highlights = []
    for drv in drivers or ["N/A"]:
        loss = next((f for f in seg if f.get("slower") == drv), None)
        gain = next((f for f in seg if f.get("faster") == drv), None)
        loss_key = loss["key"][4:] if loss else "n/a"
        gain_key = gain["key"][4:] if gain else "n/a"
        highlights.append(
            DriverHighlight(
                driver=drv,
                headline=f"{drv}: largest teammate gap in {loss_key if loss else gain_key}.",
                primary_time_loss=f"{loss['value']} s in {loss_key}" if loss else "None significant.",
                primary_time_gain=f"{gain['value']} s in {gain_key}" if gain else "None significant.",
                facts_used=[f["key"] for f in (loss, gain) if f],
            )
        )
    return TeamDebrief(
        team=team,
        team_summary="Automatic summary (deterministic fallback applied).",
        drivers=highlights[:2],
    )


def debrief_team(
    session_id: str,
    team: str,
    facts: list[dict],
    model: str,
) -> tuple[TeamDebrief, bool, dict]:
    """Generate debrief for one team with up to 3 retry attempts."""
    if not facts:
        return fallback_debrief(team, facts), False, {}

    messages = [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": f"Session {session_id}, team {team}.\nFACTS:\n{json.dumps(facts, separators=(',', ':'))}",
        },
    ]
    schema = TeamDebrief.model_json_schema()
    meta: dict = {}
    for _ in range(3):
        try:
            raw, meta = chat_json(model, messages, schema)
            deb = TeamDebrief.model_validate_json(raw)
            problems = grounding_problems(deb, facts)
        except ValidationError as e:
            raw = ""
            problems = [f"JSON does not match the schema: {e.errors()[:3]}"]
        except Exception as e:
            raw = ""
            problems = [f"LLM call error: {e}"]

        if not problems:
            return deb, True, meta

        messages += [
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": "Fix these problems and reply with corrected JSON only:\n- "
                + "\n- ".join(problems[:8]),
            },
        ]
    return fallback_debrief(team, facts), False, meta


def run_debrief_session(session_id: str, model: str = DEBRIEF_MODEL) -> Path:
    """Run post-session debrief for all teams in a session."""
    con = connect()
    teams = [
        r[0]
        for r in con.execute(
            "SELECT DISTINCT team FROM laps WHERE session_id = ? ORDER BY team",
            [session_id],
        ).fetchall()
        if r[0]
    ]

    ollama_ver = ollama_version()
    rows = []
    report_sections = [f"# Post-Session Debrief: {session_id}\n"]

    for team in teams:
        facts = build_facts(con, session_id, team)
        facts_hash = hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()
        deb, grounded, _ = debrief_team(session_id, team, facts, model)

        report_sections.append(f"## {team}\n")
        report_sections.append(f"**Summary:** {deb.team_summary}\n")
        if deb.setup_hypotheses:
            report_sections.append("**Setup Hypotheses:**")
            for h in deb.setup_hypotheses:
                report_sections.append(f"- {h}")
            report_sections.append("")

        for d in deb.drivers:
            rows.append({
                "session_id": session_id,
                "team": team,
                "driver": d.driver,
                "headline": d.headline,
                "primary_time_loss": d.primary_time_loss,
                "primary_time_gain": d.primary_time_gain,
                "team_summary": deb.team_summary,
                "setup_hypotheses": json.dumps(deb.setup_hypotheses),
                "facts_used": json.dumps(d.facts_used),
                "grounded": grounded,
                "model": model,
                "ollama_version": ollama_ver,
                "think": False,
                "facts_hash": facts_hash,
                "pipeline_version": PIPELINE_VERSION,
                "created_at": pd.Timestamp.utcnow().isoformat(),
            })
            report_sections.append(f"### {d.driver}")
            report_sections.append(f"- **Headline:** {d.headline}")
            report_sections.append(f"- **Loss:** {d.primary_time_loss}")
            report_sections.append(f"- **Gain:** {d.primary_time_gain}\n")

    if rows:
        df = pd.DataFrame(rows)
        write_table(df, "session_highlights", session_id)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"{session_id}.md"
    report_path.write_text("\n".join(report_sections), encoding="utf-8")
    print(f"Debrief completed for {session_id}. Report saved to {report_path}")
    return report_path


if __name__ == "__main__":
    sid = sys.argv[1] if len(sys.argv) > 1 else "2024_16_FP2"
    m = sys.argv[2] if len(sys.argv) > 2 else DEBRIEF_MODEL
    run_debrief_session(sid, m)
