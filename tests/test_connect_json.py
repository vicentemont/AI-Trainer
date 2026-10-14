
from ai_trainer_garmin.garmin.connect_json import workout_to_connect_json
from ai_trainer_garmin.models import Sport, Step, Workout


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


def test_repeat_block_alternates_work_and_recovery():
    from ai_trainer_garmin.fit.workout_writer import workout_to_fit
    from ai_trainer_garmin.models import RepeatBlock

    w = Workout(name="4x400", sport=Sport.RUNNING, steps=[
        Step(kind="warmup", duration_value=600),
        RepeatBlock(repeat=4, steps=[Step(duration_type="distance", duration_value=400),
                                     Step(kind="recovery", duration_value=90)]),
    ])
    group = workout_to_connect_json(w)["workoutSegments"][0]["workoutSteps"][1]
    assert group["numberOfIterations"] == 4 and len(group["workoutSteps"]) == 2
    assert [s["stepType"]["stepTypeKey"] for s in group["workoutSteps"]] == ["interval", "recovery"]
    from io import BytesIO

    from fitparse import FitFile
    steps = list(FitFile(BytesIO(workout_to_fit(w))).get_messages("workout_step"))
    assert len(steps) == 1 + 8
    assert [s.get_value("intensity") for s in steps[1:5]] == ["active", 4, "active", 4]  # 4 = FIT intensity "recovery"


def test_workout_json_with_blocks_validates():
    w = Workout.model_validate({"name": "x", "sport": "running", "steps": [
        {"repeat": 3, "steps": [{"duration_value": 60}, {"kind": "recovery", "duration_value": 30}]},
        {"duration_value": 300}]})
    from ai_trainer_garmin.models import RepeatBlock
    assert isinstance(w.steps[0], RepeatBlock) and not isinstance(w.steps[1], RepeatBlock)
