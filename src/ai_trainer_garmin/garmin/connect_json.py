"""Convert an internal `Workout` into the JSON accepted by Garmin Connect's workout service."""
from __future__ import annotations

from typing import Any

from ..models import Sport, Step, Workout

# (id, key, displayOrder) triples; ids/keys come from Garmin's /workout-service/workout/types
_SPORT = {
    Sport.RUNNING: (1, "running", 1),
    Sport.CYCLING: (2, "cycling", 2),
    Sport.SWIMMING: (4, "swimming", 3),
    Sport.STRENGTH: (5, "strength_training", 5),
}
_STEP = {"warmup": (1, "warmup", 1), "cooldown": (2, "cooldown", 2), "active": (3, "interval", 3),
         "recovery": (4, "recovery", 4), "rest": (5, "rest", 5)}
_COND = {"open": (1, "lap.button", 1), "time": (2, "time", 2), "distance": (3, "distance", 3)}
_TARGET = {"none": (1, "no.target", 1), "power_w": (2, "power.zone", 2), "cadence": (3, "cadence", 3),
           "hr_zone": (4, "heart.rate.zone", 4), "hr_bpm": (4, "heart.rate.zone", 4),
           "pace": (6, "pace.zone", 6)}


def _executable(step: Step, order: int) -> dict[str, Any]:
    sid, skey, sord = _STEP[step.kind]
    cid, ckey, cord = _COND[step.duration_type if step.duration_value else "open"]
    tid, tkey, tord = _TARGET[step.target_type if step.target_low is not None else "none"]
    d: dict[str, Any] = {
        "type": "ExecutableStepDTO",
        "stepOrder": order,
        "stepType": {"stepTypeId": sid, "stepTypeKey": skey, "displayOrder": sord},
        "endCondition": {"conditionTypeId": cid, "conditionTypeKey": ckey, "displayOrder": cord,
                         "displayable": True},
        "endConditionValue": step.duration_value if cid != 1 else None,
        "targetType": {"workoutTargetTypeId": tid, "workoutTargetTypeKey": tkey, "displayOrder": tord},
    }
    if step.notes:
        d["description"] = step.notes[:512]
    if tid != 1:
        lo, hi = step.target_low, step.target_high if step.target_high is not None else step.target_low
        if step.target_type == "hr_zone":
            d["zoneNumber"] = int(lo)
        elif step.target_type == "pace":  # s/km -> m/s, slower pace = lower speed
            slow, fast = max(lo, hi), min(lo, hi)
            d["targetValueOne"], d["targetValueTwo"] = 1000 / slow, 1000 / fast
        else:
            d["targetValueOne"], d["targetValueTwo"] = min(lo, hi), max(lo, hi)
    return d


def estimated_seconds(workout: Workout) -> int:
    """Rough duration; Garmin uses it to list and sync the workout. Distance steps use a pace guess."""
    total = 0.0
    for s in workout.steps:
        v = s.duration_value or 0
        if s.duration_type == "distance":
            pace = {"running": 360, "cycling": 120, "swimming": 1500}.get(workout.sport.value, 360)
            if s.target_type == "pace" and s.target_low:
                pace = (s.target_low + (s.target_high or s.target_low)) / 2
            v = v / 1000 * pace
        elif s.duration_type == "open":
            v = 300
        total += v * s.repeat
    return max(int(total), 60)


def workout_to_connect_json(workout: Workout) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    order = 1
    for s in workout.steps:
        if s.repeat > 1:
            child = _executable(s, order + 1)
            steps.append({
                "type": "RepeatGroupDTO", "stepOrder": order,
                "stepType": {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6},
                "numberOfIterations": s.repeat,
                "smartRepeat": False,
                "endCondition": {"conditionTypeId": 7, "conditionTypeKey": "iterations", "displayOrder": 7,
                                 "displayable": False},
                "endConditionValue": float(s.repeat),
                "workoutSteps": [child],
            })
            order += 2
        else:
            steps.append(_executable(s, order))
            order += 1
    sid, skey, sord = _SPORT[workout.sport]
    sport = {"sportTypeId": sid, "sportTypeKey": skey, "displayOrder": sord}
    payload: dict[str, Any] = {
        "workoutName": workout.name,
        "sportType": sport,
        "estimatedDurationInSecs": estimated_seconds(workout),
        "author": {},
        "workoutSegments": [{"segmentOrder": 1, "sportType": sport, "workoutSteps": steps}],
    }
    desc = "\n".join(x for x in (workout.description, f"Why: {workout.why}" if workout.why else None) if x)
    if desc:
        payload["description"] = desc[:512]
    return payload
