"""Grounding verification: ensures numbers, keys, and hypotheses strictly trace to facts."""
import json
import re

from f1_ai.debrief.schema import TeamDebrief

NUM = re.compile(r"\d+(?:\.\d+)?")


def allowed_numbers(facts: list[dict]) -> set[str]:
    """Extract set of allowable numeric representations from fact sheet."""
    allowed = set(NUM.findall(json.dumps(facts)))  # includes corner numbers, lap counts
    for f in facts:
        for val_key in ("value", "min", "max"):
            v = f.get(val_key)
            if isinstance(v, (int, float)):
                allowed |= {f"{abs(v):.{nd}f}" for nd in range(4)}  # e.g. 0.084 -> "0", "0.1", "0.08", "0.084"
                allowed |= {str(int(round(abs(v))))}
        ci = f.get("ci")
        if isinstance(ci, list):
            for v in ci:
                if isinstance(v, (int, float)):
                    allowed |= {f"{abs(v):.{nd}f}" for nd in range(4)}
    return allowed


def grounding_problems(deb: TeamDebrief, facts: list[dict]) -> list[str]:
    """Find grounding issues: ungrounded numbers, unknown fact keys, invalid hypothesis prefix."""
    keys = {f["key"] for f in facts}
    allowed = allowed_numbers(facts)
    problems: list[str] = []

    texts = [deb.team_summary, *deb.setup_hypotheses]
    texts += [f"{h.headline} {h.primary_time_loss} {h.primary_time_gain}" for h in deb.drivers]

    for text in texts:
        problems += [
            f"Number {n} is not in the facts (in: '{text[:80]}')"
            for n in NUM.findall(text)
            if n not in allowed
        ]

    for h in deb.drivers:
        problems += [f"Unknown fact key '{k}'" for k in h.facts_used if k not in keys]

    problems += [
        "Setup ideas must start with 'Hypothesis:'"
        for s in deb.setup_hypotheses
        if not s.startswith("Hypothesis:")
    ]

    return problems
