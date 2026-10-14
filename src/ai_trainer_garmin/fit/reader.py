"""Parse activity .fit files into `Activity` summaries."""
from __future__ import annotations

from pathlib import Path

from fitparse import FitFile

from ..models import Activity


def read_activity(path: str | Path) -> Activity | None:
    """Return a summary of the file's session, or None if it holds no session."""
    path = Path(path)
    sessions = list(FitFile(str(path)).get_messages("session"))
    if not sessions:
        return None
    s = sessions[0].get_values()
    return Activity(
        sport=str(s.get("sport", "unknown")),
        start_time=s.get("start_time"),
        duration_s=float(s.get("total_timer_time") or 0),
        distance_m=float(s.get("total_distance") or 0),
        avg_hr=s.get("avg_heart_rate"),
        max_hr=s.get("max_heart_rate"),
        avg_power_w=s.get("avg_power"),
        total_ascent_m=s.get("total_ascent"),
        calories=s.get("total_calories"),
        source_file=path.name,
    )


def read_folder(folder: str | Path) -> list[Activity]:
    """Read every .fit file in a folder, skipping unreadable ones; newest first."""
    out: list[Activity] = []
    for f in sorted(Path(folder).glob("*.fit")) + sorted(Path(folder).glob("*.FIT")):
        try:
            act = read_activity(f)
        except Exception:
            continue
        if act:
            out.append(act)
    return sorted(out, key=lambda a: a.start_time or 0, reverse=True)
