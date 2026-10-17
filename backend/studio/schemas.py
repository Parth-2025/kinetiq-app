import datetime as dt
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AccountInput(Input):
    role: Literal["athlete", "coach"]
    onboarding_complete: bool | None = None


class AthleteInput(Input):
    name: str = Field(min_length=1, max_length=120)
    sport: str = Field(default="basketball", max_length=40)
    dominant_side: Literal["left", "right", "both", "unknown"] = "unknown"
    team_id: UUID | None = None


class MeasurementsInput(Input):
    height_cm: float | None = Field(default=None, ge=50, le=260, allow_inf_nan=False)
    wingspan_cm: float | None = Field(default=None, ge=50, le=300, allow_inf_nan=False)
    provenance: Literal["self_reported", "coach_measured"] = "self_reported"


class TeamInput(Input):
    name: str = Field(min_length=1, max_length=120)
    sport: str = Field(default="basketball", max_length=40)
    description: str = Field(default="", max_length=2000)


class MemberInput(Input):
    athlete_id: UUID


class JoinInput(Input):
    code: str = Field(min_length=8, max_length=128)


class AssignmentInput(Input):
    title: str = Field(min_length=1, max_length=160)
    skill_id: str = Field(max_length=80)
    instructions: str = Field(default="", max_length=8000)
    team_id: UUID | None = None
    athlete_id: UUID | None = None
    due_at: dt.datetime | None = None
    published: bool = False

    @model_validator(mode="after")
    def recipient(self):
        if bool(self.team_id) == bool(self.athlete_id):
            raise ValueError("Choose one team or one athlete as recipient.")
        return self


class RosterEntry(Input):
    athlete_id: UUID
    jersey: str = Field(default="", max_length=12)
    side: Literal["home", "away"] = "home"


class PracticeInput(Input):
    title: str = Field(min_length=1, max_length=160)
    team_id: UUID
    notes: str = Field(default="", max_length=8000)
    scheduled_at: dt.datetime | None = None
    roster: list[RosterEntry] = Field(default_factory=list, max_length=100)


class EventInput(Input):
    athlete_id: UUID | None = None
    kind: Literal["shot", "pass", "turnover", "rebound", "note"]
    timestamp_seconds: float = Field(ge=0, le=86400, allow_inf_nan=False)
    outcome: Literal["made", "missed", "unknown"] = "unknown"
    note: str = Field(default="", max_length=3000)


class SessionInput(Input):
    athlete_id: UUID | None = None
    skill_id: str = "basketball.free-throw"
    assignment_id: UUID | None = None


class ShareInput(Input):
    team_ids: list[UUID] = Field(default_factory=list, max_length=30)


class FeedbackInput(Input):
    body: str = Field(min_length=1, max_length=10000)
    published: bool = False


class DeviceInput(Input):
    name: str = Field(min_length=1, max_length=120)
    serial: str = Field(min_length=1, max_length=120)
    kind: Literal["camera", "uwb_tag", "anchor", "imu", "hub"]
    athlete_id: UUID | None = None
