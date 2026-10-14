import io
import zipfile
from datetime import date, timedelta
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient
from fitparse import FitFile

from ai_trainer_garmin.garmin.delivery import MfaRequired, deliver_to_connect
from ai_trainer_garmin.models import Sport, Step, Workout
from ai_trainer_garmin.web.app import app

WORKOUT = {"name": "Easy run", "sport": "running", "scheduled_for": date.today().isoformat(),
           "steps": [{"kind": "active", "duration_type": "time", "duration_value": 1800}]}


class FakeClient:
    def dumps(self):
        return '{"tokens": "fresh"}'


class FakeGarmin:
    log: ClassVar[list] = []
    mfa = False

    def __init__(self, email=None, password=None, return_on_mfa=False):
        self.client = FakeClient()
        FakeGarmin.log = []

    def login(self, tokenstore=None):
        FakeGarmin.log.append(("login", tokenstore))
        return ("needs_mfa", None) if FakeGarmin.mfa else (None, None)

    def upload_workout(self, payload):
        FakeGarmin.log.append(("upload", payload["workoutName"]))
        return {"workoutId": 42}

    def schedule_workout(self, wid, d):
        FakeGarmin.log.append(("schedule", wid, d))

    def push_workout_to_device(self, wid):
        FakeGarmin.log.append(("push", wid))


def w(days_ahead):
    return Workout(name="Run", sport=Sport.RUNNING, scheduled_for=date.today() + timedelta(days=days_ahead),
                   steps=[Step(duration_value=600)])


def test_deliver_uploads_schedules_and_pushes_only_soon_workouts():
    FakeGarmin.mfa = False
    out = deliver_to_connect([w(2), w(20)], email="a@b.c", password="x", garmin_cls=FakeGarmin)
    kinds = [e[0] for e in FakeGarmin.log]
    assert kinds.count("upload") == 2 and kinds.count("schedule") == 2 and kinds.count("push") == 1
    assert "(sent to watch)" in out["results"][0] and "(sent to watch)" not in out["results"][1]
    assert FakeGarmin.log[1][1] == "[AIT] Run"
    assert out["tokens"] == '{"tokens": "fresh"}'


def test_deliver_reuses_saved_tokens():
    FakeGarmin.mfa = False
    deliver_to_connect([w(1)], tokens='{"t":1}', garmin_cls=FakeGarmin)
    assert FakeGarmin.log[0] == ("login", '{"t":1}')


def test_mfa_is_reported_not_attempted():
    FakeGarmin.mfa = True
    with pytest.raises(MfaRequired):
        deliver_to_connect([w(1)], email="a", password="b", garmin_cls=FakeGarmin)


def test_fit_endpoint_returns_valid_zip():
    r = TestClient(app).post("/api/fit", json={"workouts": [WORKOUT]})
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    (name,) = z.namelist()
    assert name.endswith("Easy_run.fit")
    assert len(list(FitFile(io.BytesIO(z.read(name))).get_messages("workout_step"))) == 1


def test_endpoints_validate_input():
    c = TestClient(app)
    assert c.post("/api/fit", json={"workouts": []}).status_code == 400
    assert c.post("/api/garmin", json={"workouts": [WORKOUT]}).status_code == 400  # no credentials
    assert c.post("/api/garmin", json={"workouts": [WORKOUT], "email": "a"}).status_code == 400
