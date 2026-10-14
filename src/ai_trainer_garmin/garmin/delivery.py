"""Ways to hand approved workouts to a Garmin account. Stateless: nothing is stored server-side."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from ..models import Workout
from .connect_json import workout_to_connect_json

NAME_PREFIX = "[AIT] "  # tag so pushed workouts can be listed/removed later


class MfaRequired(Exception):
    """The account has two-step verification, which a stateless call cannot complete."""


def deliver_to_connect(
    workouts: list[Workout],
    *,
    email: str = "",
    password: str = "",
    tokens: str = "",
    push_days: int = 7,
    garmin_cls: Any = None,
) -> dict[str, Any]:
    """Log in (with saved tokens if given, else email/password), upload + schedule each workout, and
    send those due within `push_days` straight to the watch. Returns results and fresh tokens."""
    if garmin_cls is None:
        from garminconnect import Garmin as garmin_cls

    api = garmin_cls(email=email or None, password=password or None, return_on_mfa=True)
    mfa_status, _ = api.login(tokens or None)
    if mfa_status == "needs_mfa":
        raise MfaRequired(
            "This Garmin account uses two-step verification, which isn't supported on the hosted site yet."
        )

    results: list[str] = []
    today = date.today()
    for w in workouts:
        payload = workout_to_connect_json(w.model_copy(update={"name": NAME_PREFIX + w.name}))
        resp = api.upload_workout(payload)
        wid = resp.get("workoutId")
        if wid and w.scheduled_for:
            api.schedule_workout(wid, w.scheduled_for.isoformat())
        note = f"{w.name}: workoutId={wid}"
        if wid and w.scheduled_for and today <= w.scheduled_for <= today + timedelta(days=push_days):
            try:
                api.push_workout_to_device(wid)
                note += " (sent to watch)"
            except Exception as e:
                note += f" (could not send to watch: {str(e)[:120]})"
        results.append(note)
    return {"results": results, "tokens": api.client.dumps()}
