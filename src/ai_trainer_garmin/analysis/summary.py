"""Turn activity summaries into a compact text context for the LLM."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from ..models import Activity


def weekly_summary(activities: list[Activity]) -> str:
    weeks: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0]))
    for a in activities:
        if not a.start_time:
            continue
        y, w, _ = a.start_time.isocalendar()
        row = weeks[f"{y}-W{w:02d}"][a.sport]
        row[0] += 1
        row[1] += a.distance_m / 1000
        row[2] += a.duration_s / 3600
    lines = []
    for wk in sorted(weeks, reverse=True)[:8]:
        parts = [f"{sp}: {n:.0f} sessions, {km:.1f} km, {h:.1f} h" for sp, (n, km, h) in weeks[wk].items()]
        lines.append(f"{wk}: " + "; ".join(parts))
    hrs = [a.max_hr for a in activities if a.max_hr]
    if hrs:
        lines.append(f"Highest observed max HR: {max(hrs)} bpm")
    return "\n".join(lines) or "No activity history provided."


def athlete_context(activities: list[Activity], today: datetime | None = None) -> str:
    return f"Today: {(today or datetime.now()):%Y-%m-%d}\nRecent weekly training load (newest first):\n" + weekly_summary(activities)
