"""Two-stage plan building: the coach commits to an outline, then each week is designed on its own.

Generating week by week keeps every LLM answer small (no truncated 16-week JSON) and lets the
app verify that every promised week really exists.
"""
from __future__ import annotations

import json
from datetime import date, timedelta

from ..models import Plan, PlanOutline, WeekWorkouts, Workout
from .client import Completer, ask_json

WEEK_PROMPT = """You are an expert endurance and strength coach designing the workouts of ONE week
of a longer plan. Output a single JSON object, no prose, matching this schema:
{schema}

Rules:
- Only schedule workouts on these dates: {dates}. Omit rest days (do not create empty workouts).
- Honour the week's theme and target volume (~{hours} h total) and the load level ({load}).
- Respect the athlete's availability, sports, equipment, injuries and thresholds from the conversation.
- pace targets are seconds per km (target_low = slower, target_high = faster); hr_bpm and power_w in
  native units; duration_value is seconds for time and metres for distance; `repeat` = repeated step.
- Every workout needs: a clear name (<60 chars), a one-sentence `description`, and `why`: 2-3 sentences on
  why this session is in this week and the physiological benefit (e.g. 'raises lactate threshold so
  race pace feels easier'). Every main work step (intervals, tempo, hills, heavy sets) needs a step `why`
  (one sentence). Use a warmup and cooldown step on structured sessions. Step `notes` max 50 chars.
- Keep everything realistic and safe; no >10% jump in volume vs the previous week."""


def week_dates(start: date, week: int) -> list[date]:
    first = start + timedelta(days=7 * (week - 1))
    return [first + timedelta(days=i) for i in range(7)]


def normalize_outline(o: PlanOutline) -> PlanOutline:
    """Renumber weeks 1..N in order and clamp phases so the structure is always consistent."""
    for i, w in enumerate(o.weeks, 1):
        w.week = i
        w.status, w.error = "pending", None
    n = len(o.weeks)
    for p in o.phases:
        p.start_week = min(max(p.start_week, 1), n)
        p.end_week = min(max(p.end_week, p.start_week), n)
    return o


def plan_digest(plan: Plan) -> str:
    """Compact text of an existing plan for the coach's context."""
    lines = [f"{plan.title} (starts {plan.start_date})"]
    for p in plan.phases:
        lines.append(f"Phase {p.name}: weeks {p.start_week}-{p.end_week} — {p.focus}")
    for wk in plan.weeks:
        names = [f"{w.scheduled_for:%a} {w.name}" for w in plan.workouts if w.week == wk.week]
        lines.append(f"W{wk.week} [{wk.status}] {wk.theme} ~{wk.target_hours}h {wk.load}: " + "; ".join(names))
    return "\n".join(lines)


def build_week(
    complete: Completer, plan: Plan, week: int, context: str, conversation: str, notes: str | None = None
) -> list[Workout]:
    """Design one week; the result is validated to fall inside that week's dates."""
    assert plan.start_date
    outline = next(w for w in plan.weeks if w.week == week)
    days = week_dates(plan.start_date, week)
    system = (
        WEEK_PROMPT.replace("{schema}", json.dumps(WeekWorkouts.model_json_schema()))
        .replace("{dates}", ", ".join(f"{d:%Y-%m-%d} ({d:%a})" for d in days))
        .replace("{hours}", str(outline.target_hours))
        .replace("{load}", outline.load)
    )
    overview = "\n".join(
        f"W{w.week}: {w.theme} (~{w.target_hours}h, {w.load})" for w in plan.weeks
    )
    phase = next((p for p in plan.phases if p.start_week <= week <= p.end_week), None)
    user = (
        f"Athlete data:\n{context}\n\nConversation:\n{conversation}\n\n"
        f"Whole plan outline:\n{overview}\n\n"
        + (f"Current phase: {phase.name} — {phase.focus}\n\n" if phase else "")
        + f"Design week {week}: {outline.theme}. {outline.why or ''}"
        + (f"\nAthlete's change request for this week: {notes}" if notes else "")
    )
    last = ""
    for _ in range(3):
        result = ask_json(complete, system, user + (f"\n\nFix this problem: {last}" if last else ""), WeekWorkouts)
        valid = {d for d in days}
        bad = [w.name for w in result.workouts if w.scheduled_for not in valid]
        if result.workouts and not bad:
            for w in result.workouts:
                w.week = week
            return sorted(result.workouts, key=lambda w: w.scheduled_for)  # type: ignore[arg-type,return-value]
        last = (
            "no workouts returned" if not result.workouts
            else f"these workouts are outside the allowed dates: {bad}"
        )
    raise RuntimeError(f"Week {week}: {last}")
