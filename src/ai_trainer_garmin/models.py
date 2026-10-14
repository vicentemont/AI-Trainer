"""Internal, provider-neutral data models shared by the LLM, FIT and delivery layers."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Sport(str, Enum):
    RUNNING = "running"
    CYCLING = "cycling"
    SWIMMING = "swimming"
    STRENGTH = "strength"


class Activity(BaseModel):
    """Summary of one completed activity parsed from a .fit file."""

    sport: str
    start_time: datetime | None = None
    duration_s: float = 0
    distance_m: float = 0
    avg_hr: int | None = None
    max_hr: int | None = None
    avg_power_w: int | None = None
    total_ascent_m: int | None = None
    calories: int | None = None
    source_file: str | None = None


class Step(BaseModel):
    """One workout step. Duration is either time or distance; target is optional."""

    kind: Literal["warmup", "active", "recovery", "rest", "cooldown"] = "active"
    duration_type: Literal["time", "distance", "open"] = "time"
    duration_value: float | None = Field(None, description="seconds for time, metres for distance")
    target_type: Literal["none", "hr_zone", "hr_bpm", "pace", "power_w", "cadence"] = "none"
    target_low: float | None = Field(None, description="pace in s/km; others in native units")
    target_high: float | None = None
    repeat: int = Field(1, ge=1, description="Repeat this step N times (simple intervals)")
    notes: str | None = Field(None, description="Very short cue shown on the watch (max 50 chars)")
    why: str | None = Field(None, description="One sentence: purpose/benefit of this step. Required on key work steps")


class Workout(BaseModel):
    name: str = Field(..., max_length=60)
    sport: Sport
    scheduled_for: date | None = None
    week: int | None = Field(None, description="Set by the app; do not output")
    description: str | None = Field(None, description="What the session is, 1 sentence")
    why: str | None = Field(None, description="2-3 sentences: why this session is here and its physiological benefit")
    steps: list[Step] = Field(..., min_length=1)


class WeekWorkouts(BaseModel):
    """LLM output when designing a single week."""

    workouts: list[Workout]


class Phase(BaseModel):
    name: str = Field(..., description="e.g. Base, Build, Peak, Taper")
    start_week: int = Field(..., ge=1)
    end_week: int = Field(..., ge=1)
    focus: str
    why: str = Field(..., description="Why this phase exists and what it achieves")


class WeekOutline(BaseModel):
    week: int = Field(..., ge=1)
    theme: str = Field(..., description="Short title, e.g. 'Aerobic base + first hill work'")
    why: str | None = Field(None, description="1-2 sentences on this week's role in the plan")
    target_hours: float = Field(..., ge=0)
    load: Literal["recovery", "easy", "moderate", "hard", "peak"] = "moderate"
    status: Literal["pending", "done", "error"] = "pending"
    error: str | None = None


class PlanOutline(BaseModel):
    """High-level periodization the coach commits to before workouts are generated."""

    title: str
    rationale: str = Field(..., description="Why the plan is structured this way, 3-5 sentences")
    start_date: date
    phases: list[Phase] = Field(..., min_length=1)
    weeks: list[WeekOutline] = Field(..., min_length=1)


class Plan(BaseModel):
    title: str
    rationale: str | None = None
    start_date: date | None = None
    phases: list[Phase] = Field(default_factory=list)
    weeks: list[WeekOutline] = Field(default_factory=list)
    workouts: list[Workout] = Field(default_factory=list)
