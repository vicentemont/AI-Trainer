import pytest

from ai_trainer_garmin import settings
from ai_trainer_garmin.web import app as webapp


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    """Never touch the real ~/.ai-trainer-garmin or keychain during tests."""
    store: dict[str, str] = {}
    monkeypatch.setattr(settings, "APP_DIR", tmp_path)
    monkeypatch.setattr(settings, "SETTINGS_FILE", tmp_path / "s.json")
    monkeypatch.setattr(settings, "get_key", lambda p: store.get(p))
    monkeypatch.setattr(settings, "set_key", lambda p, k: store.__setitem__(p, k))
    monkeypatch.setattr(webapp, "APP_DIR", tmp_path)
    monkeypatch.setattr(webapp, "STATE_FILE", tmp_path / "conversation.json")
    monkeypatch.setattr(webapp, "_conv", None)
