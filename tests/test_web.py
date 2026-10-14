import json
import time
from datetime import date, timedelta

from fastapi.testclient import TestClient

from ai_trainer_garmin.web import app as webapp

START = date(2026, 10, 19)  # a Monday


def outline(n):
    return {
        "title": f"{n}-week plan", "rationale": "Because.", "start_date": START.isoformat(),
        "phases": [{"name": "Base", "start_week": 1, "end_week": n, "focus": "aerobic", "why": "foundation"}],
        "weeks": [{"week": i, "theme": f"Week {i}", "target_hours": 4, "load": "easy"} for i in range(1, n + 1)],
    }


def fake_llm(system, user):
    if "ONE week" in system:  # week designer: schedule on the first allowed date
        first = system.split("these dates: ")[1][:10]
        return json.dumps({"workouts": [{"name": "Easy run", "sport": "running", "scheduled_for": first,
                           "why": "Builds the aerobic base.",
                           "steps": [{"kind": "active", "duration_type": "time", "duration_value": 1800}]}]})
    if "Athlete: 16 weeks" in user:
        return json.dumps({"reply": "Building your plan now.", "outline": outline(5)})
    return json.dumps({"reply": "What's your goal?"})


def setup(monkeypatch):
    monkeypatch.setattr(webapp, "make_completer", lambda *a, **k: fake_llm)
    c = TestClient(webapp.app)
    assert c.post("/api/settings", json={"provider": "anthropic", "api_key": "sk-x"}).status_code == 200
    return c


def wait_built(c):
    for _ in range(100):
        s = c.get("/api/state").json()
        if not s["building"]:
            return s
        time.sleep(0.05)
    raise AssertionError("build never finished")


def test_chat_needs_key():
    r = TestClient(webapp.app).post("/api/chat", json={"message": "hi"})
    assert r.status_code == 400 and "API key" in r.json()["error"]


def test_every_promised_week_is_built(monkeypatch, tmp_path):
    c = setup(monkeypatch)
    s = c.post("/api/chat", json={"message": "hello"}).json()
    assert s["plan"] is None
    c.post("/api/chat", json={"message": "16 weeks"})
    s = wait_built(c)
    plan = s["plan"]
    assert len(plan["weeks"]) == 5 and all(w["status"] == "done" for w in plan["weeks"])
    assert sorted(w["week"] for w in plan["workouts"]) == [1, 2, 3, 4, 5]
    dates = sorted(w["scheduled_for"] for w in plan["workouts"])
    assert dates == [(START + timedelta(days=7 * i)).isoformat() for i in range(5)]
    assert "5-week plan is ready" in s["messages"][-1]["content"]
    out = c.post("/api/deliver", json={"selected": [0], "method": "folder", "folder": str(tmp_path / "out")})
    assert out.status_code == 200 and list((tmp_path / "out").glob("*.fit"))
    assert c.post("/api/reset").json()["plan"] is None


def test_failed_week_is_retryable(monkeypatch):
    c = setup(monkeypatch)
    calls = {"n": 0}

    def flaky(system, user):
        if "ONE week" in system and "2026-10-26" in system:
            calls["n"] += 1
            if calls["n"] <= 3:  # first attempt (3 tries) fails
                return json.dumps({"workouts": []})
        return fake_llm(system, user)

    monkeypatch.setattr(webapp, "make_completer", lambda *a, **k: flaky)
    c.post("/api/chat", json={"message": "16 weeks"})
    s = wait_built(c)
    assert [w["status"] for w in s["plan"]["weeks"]].count("error") == 1
    c.post("/api/retry", json={"weeks": [2]})
    s = wait_built(c)
    assert all(w["status"] == "done" for w in s["plan"]["weeks"])


def test_chat_error_rolls_back_user_message(monkeypatch):
    def boom(system, user):
        raise RuntimeError("boom")

    monkeypatch.setattr(webapp, "make_completer", lambda *a, **k: boom)
    c = TestClient(webapp.app)
    c.post("/api/settings", json={"provider": "openai", "api_key": "k"})
    assert c.post("/api/chat", json={"message": "hi"}).status_code == 502
    assert all(m["role"] != "user" for m in c.get("/api/state").json()["messages"])
