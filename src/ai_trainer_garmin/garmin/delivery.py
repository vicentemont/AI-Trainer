"""Ways to hand approved workouts to a Garmin device or account."""
from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import Path

from ..fit.workout_writer import workout_to_fit
from ..models import Workout
from .connect_json import workout_to_connect_json

NAME_PREFIX = "[AIT] "  # tag so pushed workouts can be listed/removed later


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")[:40] or "workout"


class FitFolderDelivery:
    """Write .fit workout files to a folder, e.g. the watch's GARMIN/NewFiles directory."""

    def __init__(self, folder: str | Path):
        self.folder = Path(folder).expanduser()

    def deliver(self, workouts: list[Workout]) -> list[str]:
        self.folder.mkdir(parents=True, exist_ok=True)
        written = []
        for i, w in enumerate(workouts, 1):
            prefix = f"{w.scheduled_for:%Y%m%d}_" if w.scheduled_for else f"{i:02d}_"
            path = self.folder / f"{prefix}{_slug(w.name)}.fit"
            path.write_bytes(workout_to_fit(w))
            written.append(str(path))
        return written


class ConnectDelivery:
    """Upload and schedule workouts in Garmin Connect via python-garminconnect (unofficial)."""

    def __init__(self, email: str, password: str, tokenstore: str | Path, prompt_mfa=None):
        from garminconnect import Garmin

        self.api = Garmin(email=email, password=password, prompt_mfa=prompt_mfa)
        self.api.login(str(Path(tokenstore).expanduser()))

    def deliver(self, workouts: list[Workout], push_days: int = 7) -> list[str]:
        """Upload + schedule each workout. Those dated within `push_days` are also sent straight to the
        watch (Garmin's 'Send to device'), because calendar entries alone sync to the device late or never."""
        results = []
        today = date.today()
        for w in workouts:
            payload = workout_to_connect_json(w.model_copy(update={"name": NAME_PREFIX + w.name}))
            resp = self.api.upload_workout(payload)
            wid = resp.get("workoutId")
            if wid and w.scheduled_for:
                self.api.schedule_workout(wid, w.scheduled_for.isoformat())
            note = f"{w.name}: workoutId={wid}"
            soon = w.scheduled_for and today <= w.scheduled_for <= today + timedelta(days=push_days)
            if wid and soon:
                try:
                    self.api.push_workout_to_device(wid)
                    note += " (sent to watch)"
                except Exception as e:
                    note += f" (could not send to watch: {str(e)[:120]})"
            results.append(note)
        return results
