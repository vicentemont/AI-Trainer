"""Conversational coach: interviews the athlete, then commits to a plan outline or edits."""
from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ..models import Plan, PlanOutline
from .client import Completer, ask_json
from .planner import plan_digest

COACH_PROMPT = """You are a friendly, expert endurance and strength coach chatting with an athlete
(running, cycling, swimming, strength). Your job: interview the athlete, then design the best plan.

How to behave:
- Ask at most 2-3 short, specific questions per turn. Never dump a long questionnaire.
- Things you need before building a plan: main goal / event and date; current weekly training
  (use the activity summary if provided, don't re-ask what you can see); days per week and typical
  session length; sports mix; strength equipment/access; injuries or limitations; known thresholds
  (max HR, FTP, threshold pace) if any; when the plan should start and how many weeks.
- When you have enough (or the athlete says to just go ahead), make reasonable assumptions, state
  them briefly, and commit to a PLAN OUTLINE. The app then builds every week's workouts itself, so:
  * The outline must cover the FULL length the athlete asked for (a 16-week plan = exactly 16 `weeks`).
  * Do NOT write workouts. Do NOT say the plan is ready/finished - say you're building it now.
  * Use sound periodization (e.g. base/build/peak/taper, recovery week about every 3-4 weeks,
    <=10% weekly volume increase) and explain WHY in `rationale`, phase `why` and week `why`.
  * start_date: a Monday, normally the next one after today unless the athlete says otherwise.
- After a plan exists you will see its digest. To change specific weeks (e.g. 'make week 4 easier',
  'swap Tuesday intervals for hills') set `regenerate_weeks` (week numbers) and `regenerate_notes`
  (precise instruction) and leave `outline` null. To restructure the whole plan, send a new `outline`.
  For questions about the plan (why a session exists) just answer in `reply` using the plan digest
  and sound training science, with both fields null.
- Keep replies concise and warm, plain text (no markdown tables).

Respond with ONE JSON object and no prose outside it:
{"reply": "<message>", "outline": <PlanOutline or null>, "regenerate_weeks": <[ints] or null>, "regenerate_notes": <string or null>}
PlanOutline schema:
{schema}"""


class Turn(BaseModel):
    reply: str
    outline: PlanOutline | None = None
    regenerate_weeks: list[int] | None = Field(None)
    regenerate_notes: str | None = None


def transcript(messages: list[dict]) -> str:
    return "\n".join(f"{'Athlete' if m['role'] == 'user' else 'Coach'}: {m['content']}" for m in messages)


def coach_turn(
    complete: Completer, messages: list[dict], athlete_context: str, current_plan: Plan | None
) -> Turn:
    system = COACH_PROMPT.replace("{schema}", json.dumps(PlanOutline.model_json_schema()))
    parts = [f"Athlete data:\n{athlete_context}"]
    if current_plan:
        parts.append("Current plan digest:\n" + plan_digest(current_plan))
    parts.append("Conversation so far:\n" + transcript(messages))
    parts.append("Write the Coach's next turn as the JSON object.")
    return ask_json(complete, system, "\n\n".join(parts), Turn)
