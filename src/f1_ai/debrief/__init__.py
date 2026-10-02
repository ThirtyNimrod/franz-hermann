"""Debrief module: fact-sheet builder, schema, grounding, and synthesis pipeline."""
from f1_ai.debrief.facts import build_facts
from f1_ai.debrief.grounding import grounding_problems
from f1_ai.debrief.pipeline import debrief_team, run_debrief_session
from f1_ai.debrief.schema import DriverHighlight, TeamDebrief

__all__ = [
    "build_facts",
    "grounding_problems",
    "debrief_team",
    "run_debrief_session",
    "DriverHighlight",
    "TeamDebrief",
]
