"""Workout models shared by the FIT writer and the Garmin Connect converter.

The browser app owns planning and sends finished workouts here as JSON.
"""
from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class Sport(StrEnum):
    RUNNING = "running"
    CYCLING = "cycling"
    SWIMMING = "swimming"
    STRENGTH = "strength"


class Step(BaseModel):
    """One workout step. Duration is either time or distance; target is optional."""

    kind: Literal["warmup", "active", "recovery", "rest", "cooldown"] = "active"
    duration_type: Literal["time", "distance", "open"] = "time"
    duration_value: float | None = Field(None, description="seconds for time, metres for distance")
    target_type: Literal["none", "hr_zone", "hr_bpm", "pace", "power_w", "cadence"] = "none"
    target_low: float | None = Field(None, description="pace in s/km; others in native units")
    target_high: float | None = None
    repeat: int = Field(1, ge=1, description="Repeat this step N times (simple intervals)")
    notes: str | None = None
    why: str | None = None


class RepeatBlock(BaseModel):
    """Several steps repeated together, e.g. 4 x (400 m fast + 90 s jog)."""

    repeat: int = Field(..., ge=2)
    steps: list[Step] = Field(..., min_length=1)


def flatten(items: list[RepeatBlock | Step]) -> list[Step]:
    """Expand repeats into the plain sequence of steps actually performed."""
    out: list[Step] = []
    for it in items:
        if isinstance(it, RepeatBlock):
            for _round in range(it.repeat):
                for step in it.steps:
                    out.extend([step] * step.repeat)
        else:
            out.extend([it] * it.repeat)
    return out


class Workout(BaseModel):
    name: str = Field(..., max_length=60)
    sport: Sport
    scheduled_for: date | None = None
    week: int | None = None
    description: str | None = None
    why: str | None = None
    steps: list[RepeatBlock | Step] = Field(..., min_length=1)
