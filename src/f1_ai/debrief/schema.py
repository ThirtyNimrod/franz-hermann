"""Pydantic schemas for the post-session debrief output."""
from pydantic import BaseModel, Field


class DriverHighlight(BaseModel):
    driver: str = Field(description="3-letter driver code (e.g. 'NOR')")
    headline: str = Field(max_length=200, description="One sentence summary")
    primary_time_loss: str = Field(description="Where and how much, citing fact values")
    primary_time_gain: str = Field(description="Where and how much, citing fact values")
    facts_used: list[str] = Field(description="Fact keys this text relies on")


class TeamDebrief(BaseModel):
    team: str
    team_summary: str = Field(max_length=400, description="Overview of team performance")
    drivers: list[DriverHighlight] = Field(min_length=1, max_length=2)
    setup_hypotheses: list[str] = Field(
        default_factory=list,
        max_length=3,
        description="Each starts with 'Hypothesis:'",
    )
