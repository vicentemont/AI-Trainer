import io

from fitparse import FitFile

from ai_trainer_garmin.fit.workout_writer import workout_to_fit
from ai_trainer_garmin.models import Sport, Step, Workout


def test_workout_roundtrip():
    w = Workout(
        name="Intervals 4x400",
        sport=Sport.RUNNING,
        steps=[
            Step(kind="warmup", duration_type="time", duration_value=600),
            Step(kind="active", duration_type="distance", duration_value=400,
                 target_type="pace", target_low=270, target_high=250, repeat=4),
            Step(kind="cooldown", duration_type="time", duration_value=300,
                 target_type="hr_bpm", target_low=120, target_high=140),
        ],
    )
    data = workout_to_fit(w)
    fit = FitFile(io.BytesIO(data))
    steps = list(fit.get_messages("workout_step"))
    assert len(steps) == 6
    names = [m.get_value("wkt_name") for m in fit.get_messages("workout")]
    assert names == ["Intervals 4x400"]
