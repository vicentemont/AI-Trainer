import json
from datetime import date

from ai_trainer_garmin.garmin.connect_json import workout_to_connect_json
from ai_trainer_garmin.llm.client import ask_json
from ai_trainer_garmin.models import Sport, Step, WeekWorkouts, Workout

WEEK = {"workouts": [{"name": "Easy run", "sport": "running", "scheduled_for": "2026-10-15",
        "steps": [{"kind": "active", "duration_type": "time", "duration_value": 1800}]}]}


def test_ask_json_retries_then_parses():
    answers = iter(["not json", "```json\n" + json.dumps(WEEK) + "\n```"])
    out = ask_json(lambda s, u: next(answers), "sys", "user", WeekWorkouts)
    assert out.workouts[0].scheduled_for == date(2026, 10, 15)


def test_connect_json_repeat_and_pace():
    w = Workout(name="x", sport=Sport.RUNNING, steps=[
        Step(duration_type="distance", duration_value=400, target_type="pace",
             target_low=270, target_high=250, repeat=4)])
    seg = workout_to_connect_json(w)["workoutSegments"][0]["workoutSteps"][0]
    assert seg["numberOfIterations"] == 4
    child = seg["workoutSteps"][0]
    assert child["targetValueOne"] < child["targetValueTwo"]


def test_connect_payload_has_fields_garmin_needs_for_device_sync():
    w = Workout(name="x", sport=Sport.RUNNING, steps=[
        Step(kind="warmup", duration_value=600),
        Step(duration_type="distance", duration_value=1000, target_type="pace", target_low=300, repeat=3)])
    p = workout_to_connect_json(w)
    assert p["estimatedDurationInSecs"] == 600 + 3 * 300
    assert p["sportType"]["displayOrder"] == 1
    step = p["workoutSegments"][0]["workoutSteps"][0]
    assert step["endCondition"]["displayable"] is True and "displayOrder" in step["stepType"]
