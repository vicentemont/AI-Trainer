"""Local settings: API keys go to the OS keychain (file fallback, chmod 600); the rest to JSON."""
from __future__ import annotations

import json
import os
from pathlib import Path

APP_DIR = Path.home() / ".ai-trainer-garmin"
SETTINGS_FILE = APP_DIR / "settings.json"
KEYS_FILE = APP_DIR / "keys.json"
SERVICE = "ai-trainer-garmin"


def _read(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def _write_private(path: Path, data: dict) -> None:
    APP_DIR.mkdir(exist_ok=True)
    path.write_text(json.dumps(data))
    os.chmod(path, 0o600)


def load() -> dict:
    return {"provider": "anthropic", "model": "", **_read(SETTINGS_FILE)}


def save(provider: str, model: str) -> None:
    _write_private(SETTINGS_FILE, {"provider": provider, "model": model})


def get_key(provider: str) -> str | None:
    try:
        import keyring

        key = keyring.get_password(SERVICE, provider)
        if key:
            return key
    except Exception:
        pass
    return _read(KEYS_FILE).get(provider)


def set_key(provider: str, key: str) -> None:
    try:
        import keyring

        keyring.set_password(SERVICE, provider, key)
        return
    except Exception:
        pass
    keys = _read(KEYS_FILE)
    keys[provider] = key
    _write_private(KEYS_FILE, keys)


def configured_providers() -> list[str]:
    return [p for p in ("openai", "anthropic", "gemini") if get_key(p)]
