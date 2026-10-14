"""Encode an internal `Workout` as a Garmin FIT workout file."""
from __future__ import annotations

from fit_tool.fit_file_builder import FitFileBuilder
from fit_tool.profile.messages.file_id_message import FileIdMessage
from fit_tool.profile.messages.workout_message import WorkoutMessage
from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
from fit_tool.profile.profile_type import (
    FileType,
    Intensity,
    Manufacturer,
    WorkoutStepDuration,
    WorkoutStepTarget,
)
from fit_tool.profile.profile_type import (
    Sport as FitSport,
)

from ..models import Sport, Step, Workout

_SPORT = {
    Sport.RUNNING: FitSport.RUNNING,
    Sport.CYCLING: FitSport.CYCLING,
    Sport.SWIMMING: FitSport.SWIMMING,
    Sport.STRENGTH: FitSport.TRAINING,
}
_INTENSITY = {
    "warmup": Intensity.WARMUP,
    "active": Intensity.ACTIVE,
    "recovery": Intensity.RECOVERY,
    "rest": Intensity.REST,
    "cooldown": Intensity.COOLDOWN,
}


def _speed_mm_s(pace_s_per_km: float) -> int:
    return round(1_000_000 / pace_s_per_km)  # m/s * 1000 = mm/s


def _step_message(step: Step, index: int) -> WorkoutStepMessage:
    m = WorkoutStepMessage()
    m.message_index = index
    m.intensity = _INTENSITY[step.kind]
    if step.notes:
        m.notes = step.notes[:50]

    if step.duration_type == "time" and step.duration_value:
        m.duration_type = WorkoutStepDuration.TIME
        m.duration_time = step.duration_value
    elif step.duration_type == "distance" and step.duration_value:
        m.duration_type = WorkoutStepDuration.DISTANCE
        m.duration_distance = step.duration_value
    else:
        m.duration_type = WorkoutStepDuration.OPEN

    lo, hi = step.target_low, step.target_high
    if step.target_type == "none" or lo is None:
        m.target_type = WorkoutStepTarget.OPEN
    elif step.target_type == "hr_zone":
        m.target_type = WorkoutStepTarget.HEART_RATE
        m.target_hr_zone = int(lo)
    elif step.target_type == "hr_bpm":
        m.target_type = WorkoutStepTarget.HEART_RATE
        m.target_value = 0
        m.custom_target_heart_rate_low = int(lo) + 100  # FIT offset: bpm + 100
        m.custom_target_heart_rate_high = int(hi if hi is not None else lo) + 100
    elif step.target_type == "pace":
        # faster pace = smaller s/km = higher speed; low speed bound comes from slower pace
        slow, fast = max(lo, hi or lo), min(lo, hi or lo)
        m.target_type = WorkoutStepTarget.SPEED
        m.target_value = 0
        m.custom_target_speed_low = _speed_mm_s(slow)
        m.custom_target_speed_high = _speed_mm_s(fast)
    elif step.target_type == "power_w":
        m.target_type = WorkoutStepTarget.POWER
        m.target_value = 0
        m.custom_target_power_low = int(lo) + 1000  # FIT offset: watts + 1000
        m.custom_target_power_high = int(hi if hi is not None else lo) + 1000
    elif step.target_type == "cadence":
        m.target_type = WorkoutStepTarget.CADENCE
        m.target_value = 0
        m.custom_target_cadence_low = int(lo)
        m.custom_target_cadence_high = int(hi if hi is not None else lo)
    return m


def workout_to_fit(workout: Workout) -> bytes:
    """Return the bytes of a FIT workout file (repeats are expanded into plain steps)."""
    expanded: list[Step] = []
    for s in workout.steps:
        expanded.extend([s] * s.repeat)

    builder = FitFileBuilder(auto_define=True, min_string_size=50)
    fid = FileIdMessage()
    fid.type = FileType.WORKOUT
    fid.manufacturer = Manufacturer.DEVELOPMENT.value
    fid.product = 0
    fid.serial_number = 0x12345678
    builder.add(fid)

    wm = WorkoutMessage()
    wm.workout_name = workout.name
    wm.sport = _SPORT[workout.sport]
    wm.num_valid_steps = len(expanded)
    builder.add(wm)

    for i, step in enumerate(expanded):
        builder.add(_step_message(step, i))
    return builder.build().to_bytes()
