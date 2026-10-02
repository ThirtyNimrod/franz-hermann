"""Tests for debrief grounding validator."""
import pytest
from f1_ai.debrief.grounding import grounding_problems, allowed_numbers
from f1_ai.debrief.schema import DriverHighlight, TeamDebrief


@pytest.fixture
def sample_facts():
    return [
        {"key": "seg.T3-T4", "value": 0.084, "unit": "s", "faster": "PIA", "slower": "NOR", "laps": [3, 4]},
        {"key": "corner.T4.brake_before_corner_m", "value": 12.5, "unit": "m", "NOR": 85.0, "PIA": 97.5, "laps": [3, 4]},
        {"key": "deg.NOR.MEDIUM", "value": 0.072, "unit": "s/lap", "ci": [0.051, 0.093], "n_laps_used": 12},
    ]


def test_grounding_pass(sample_facts):
    deb = TeamDebrief(
        team="McLaren",
        team_summary="McLaren showed strong pace in practice.",
        drivers=[
            DriverHighlight(
                driver="NOR",
                headline="NOR lost 0.084 s to teammate in T3-T4.",
                primary_time_loss="Lost 0.084 s in T3-T4 braking 12.5 m earlier.",
                primary_time_gain="Managed 0.072 s/lap deg on MEDIUM tyres.",
                facts_used=["seg.T3-T4", "corner.T4.brake_before_corner_m", "deg.NOR.MEDIUM"],
            ),
        ],
        setup_hypotheses=["Hypothesis: Front wing angle adjustment may recover T3-T4 loss."],
    )
    problems = grounding_problems(deb, sample_facts)
    assert problems == [], f"Expected no problems, got {problems}"


def test_grounding_rejects_hallucinated_number(sample_facts):
    deb = TeamDebrief(
        team="McLaren",
        team_summary="McLaren lost 0.555 s overall.",  # 0.555 is not in facts!
        drivers=[
            DriverHighlight(
                driver="NOR",
                headline="NOR had consistent running.",
                primary_time_loss="0.084 s in T3-T4",
                primary_time_gain="None",
                facts_used=["seg.T3-T4"],
            )
        ],
    )
    problems = grounding_problems(deb, sample_facts)
    assert any("0.555" in p for p in problems)


def test_grounding_rejects_unknown_fact_key(sample_facts):
    deb = TeamDebrief(
        team="McLaren",
        team_summary="McLaren debrief.",
        drivers=[
            DriverHighlight(
                driver="NOR",
                headline="NOR pace analysis.",
                primary_time_loss="0.084 s in T3-T4",
                primary_time_gain="None",
                facts_used=["seg.UNKNOWN_KEY"],
            )
        ],
    )
    problems = grounding_problems(deb, sample_facts)
    assert any("UNKNOWN_KEY" in p for p in problems)


def test_grounding_enforces_hypothesis_prefix(sample_facts):
    deb = TeamDebrief(
        team="McLaren",
        team_summary="McLaren debrief.",
        drivers=[
            DriverHighlight(
                driver="NOR",
                headline="NOR pace analysis.",
                primary_time_loss="0.084 s in T3-T4",
                primary_time_gain="None",
                facts_used=["seg.T3-T4"],
            )
        ],
        setup_hypotheses=["Change tyre pressures by 1 psi."],  # Missing 'Hypothesis:'
    )
    problems = grounding_problems(deb, sample_facts)
    assert any("Hypothesis:" in p for p in problems)
