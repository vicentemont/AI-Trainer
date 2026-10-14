"""Local web UI: chat with an AI coach on the left, the plan on the right.

Runs on localhost. API keys live in the OS keychain; Garmin passwords are used per request only.
"""
from __future__ import annotations

import asyncio
import logging
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import settings
from ..analysis.summary import athlete_context
from ..fit.reader import read_activity
from ..garmin.delivery import ConnectDelivery, FitFolderDelivery
from ..llm.client import DEFAULT_MODELS, make_completer
from ..llm.coach import coach_turn, transcript
from ..llm.planner import build_week, normalize_outline
from ..models import Activity, Plan

log = logging.getLogger("uvicorn.error")
APP_DIR = settings.APP_DIR
STATE_FILE = APP_DIR / "conversation.json"
STATIC = Path(__file__).parent / "static"
app = FastAPI(title="AI Trainer for Garmin")

GREETING = (
    "Hi! I'm your AI coach. Upload some recent .fit activity files with the paperclip (optional but "
    "helpful), then tell me what you're training for."
)


class Conversation(BaseModel):
    messages: list[dict] = Field(default_factory=list)
    activities: list[Activity] = Field(default_factory=list)
    plan: Plan | None = None
    building: bool = False


_conv: Conversation | None = None
_lock = threading.RLock()
BUILD_WORKERS = 3


def _get() -> Conversation:
    global _conv
    if _conv is None:
        try:
            _conv = Conversation.model_validate_json(STATE_FILE.read_text())
        except (OSError, ValueError):
            _conv = Conversation()
        if _conv.building:  # the app was closed mid-build: surface unfinished weeks as retryable
            _conv.building = False
            for w in (_conv.plan.weeks if _conv.plan else []):
                if w.status == "pending":
                    w.status, w.error = "error", "Interrupted - retry this week"
    return _conv


def _save() -> None:
    with _lock:
        APP_DIR.mkdir(exist_ok=True)
        STATE_FILE.write_text(_get().model_dump_json())


def _view() -> dict:
    with _lock:
        return _view_locked()


def _view_locked() -> dict:
    c = _get()
    return {
        "messages": c.messages or [{"role": "assistant", "content": GREETING}],
        "plan": c.plan.model_dump(mode="json") if c.plan else None,
        "activities": len(c.activities),
        "building": c.building,
        "saved_providers": settings.configured_providers(),
        "prefs": settings.load(),
    }


@app.get("/", response_class=HTMLResponse)
def index():
    page = STATIC / "index.html"
    if not page.exists():
        return HTMLResponse("Frontend not built. Run: cd frontend && npm install && npm run build", 503)
    return FileResponse(page)


@app.get("/api/state")
def state():
    return _view()


@app.post("/api/reset")
def reset():
    global _conv
    _conv = Conversation()
    _save()
    return _view()


class ChatIn(BaseModel):
    message: str


def _completer():
    prefs = settings.load()
    provider = prefs["provider"]
    key = settings.get_key(provider)
    if not key:
        raise ValueError(f"No API key saved for {provider}. Open Settings to add one.")
    return make_completer(provider, key, prefs.get("model") or None)


def _build_weeks(weeks: list[int], notes: str | None) -> None:
    """Background job: design the given weeks in parallel, publishing each as it completes."""
    c = _get()
    try:
        complete = _completer()
        context = athlete_context(c.activities, datetime.now())
        convo = transcript(c.messages)
    except Exception as e:
        _finish_build(weeks, str(e))
        return

    def one(week: int) -> None:
        try:
            with _lock:
                plan_snapshot = c.plan.model_copy(deep=True)  # type: ignore[union-attr]
            workouts = build_week(complete, plan_snapshot, week, context, convo, notes)
            with _lock:
                assert c.plan
                c.plan.workouts = [w for w in c.plan.workouts if w.week != week] + workouts
                wk = next(w for w in c.plan.weeks if w.week == week)
                wk.status, wk.error = "done", None
        except Exception as e:
            log.exception("week %s failed", week)
            with _lock:
                wk = next((w for w in c.plan.weeks if w.week == week), None)  # type: ignore[union-attr]
                if wk:
                    wk.status, wk.error = "error", str(e)[:300]
        _save()

    with ThreadPoolExecutor(BUILD_WORKERS) as pool:
        list(pool.map(one, weeks))
    _finish_build(weeks, None)


def _finish_build(weeks: list[int], fatal: str | None) -> None:
    c = _get()
    with _lock:
        if fatal and c.plan:
            for w in c.plan.weeks:
                if w.week in weeks and w.status == "pending":
                    w.status, w.error = "error", fatal[:300]
        c.building = False
        if c.plan:
            done = sum(w.status == "done" for w in c.plan.weeks)
            failed = [w.week for w in c.plan.weeks if w.status == "error"]
            total = len(c.plan.weeks)
            msg = (f"Your {total}-week plan is ready: {len(c.plan.workouts)} workouts across {total} weeks. "
                   "Open any workout to see why it's there. Ask me to change anything.")
            if failed:
                msg = (f"I built {done} of {total} weeks. Week(s) {', '.join(map(str, failed))} failed - "
                       "use the Retry button on those weeks.")
            c.messages.append({"role": "assistant", "content": msg})
    _save()


def _start_build(weeks: list[int], notes: str | None) -> None:
    c = _get()
    c.building = True
    if c.plan:
        for w in c.plan.weeks:
            if w.week in weeks:
                w.status, w.error = "pending", None
    _save()
    threading.Thread(target=_build_weeks, args=(weeks, notes), daemon=True).start()


@app.post("/api/chat")
async def chat(body: ChatIn):
    c = _get()
    if c.building:
        return JSONResponse({"error": "Your plan is still being built - one moment."}, 409)
    try:
        completer = _completer()
    except ValueError as e:
        return JSONResponse({"error": str(e)}, 400)
    c.messages.append({"role": "user", "content": body.message.strip()})
    try:
        turn = await asyncio.to_thread(
            coach_turn, completer, c.messages, athlete_context(c.activities, datetime.now()), c.plan
        )
    except Exception as e:
        log.exception("coach turn failed")
        c.messages.pop()
        return JSONResponse({"error": str(e)[:600]}, 502)
    c.messages.append({"role": "assistant", "content": turn.reply})
    if turn.outline:
        outline = normalize_outline(turn.outline)
        c.plan = Plan(
            title=outline.title, rationale=outline.rationale, start_date=outline.start_date,
            phases=outline.phases, weeks=outline.weeks, workouts=[],
        )
        _start_build([w.week for w in c.plan.weeks], None)
    elif turn.regenerate_weeks and c.plan:
        valid = {w.week for w in c.plan.weeks}
        weeks = sorted({w for w in turn.regenerate_weeks if w in valid})
        if weeks:
            _start_build(weeks, turn.regenerate_notes)
    _save()
    return _view()


class RetryIn(BaseModel):
    weeks: list[int]


@app.post("/api/retry")
def retry(body: RetryIn):
    c = _get()
    if c.building or not c.plan:
        return JSONResponse({"error": "Nothing to retry right now."}, 409)
    valid = {w.week for w in c.plan.weeks}
    weeks = [w for w in body.weeks if w in valid]
    if weeks:
        _start_build(weeks, None)
    return _view()


@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...)):
    c = _get()
    added, skipped = 0, []
    with tempfile.TemporaryDirectory() as tmp:
        for i, up in enumerate(files):
            p = Path(tmp) / f"{i}.fit"
            p.write_bytes(await up.read())
            try:
                act = read_activity(p)
            except Exception:
                act = None
            if act:
                act.source_file = up.filename
                c.activities.append(act)
                added += 1
            else:
                skipped.append(up.filename)
    note = f"Uploaded {added} activity file(s)." + (f" Couldn't read: {', '.join(skipped)}." if skipped else "")
    c.messages.append({"role": "assistant", "content": note + " Tell me about your goal when you're ready."})
    _save()
    return _view()


class SettingsIn(BaseModel):
    provider: str
    api_key: str = ""
    model: str = ""


@app.post("/api/settings")
def save_settings(body: SettingsIn):
    if body.provider not in DEFAULT_MODELS:
        return JSONResponse({"error": "Unknown provider."}, 400)
    if body.api_key.strip():
        settings.set_key(body.provider, body.api_key.strip())
    settings.save(body.provider, body.model.strip())
    return _view()


class DeliverIn(BaseModel):
    selected: list[int]
    method: str = "folder"
    folder: str = ""
    email: str = ""
    password: str = ""
    push_days: int = 7


@app.post("/api/deliver")
async def deliver(body: DeliverIn):
    c = _get()
    if not c.plan:
        return JSONResponse({"error": "No plan yet."}, 400)
    workouts = [c.plan.workouts[i] for i in body.selected if 0 <= i < len(c.plan.workouts)]
    if not workouts:
        return JSONResponse({"error": "Select at least one workout."}, 400)
    try:
        if body.method == "folder":
            out = FitFolderDelivery(body.folder or APP_DIR / "workouts").deliver(workouts)
        else:
            APP_DIR.mkdir(exist_ok=True)
            out = await asyncio.to_thread(
                lambda: ConnectDelivery(body.email, body.password, APP_DIR / "garmin_tokens").deliver(
                    workouts, body.push_days
                )
            )
    except Exception as e:
        log.exception("delivery failed")
        return JSONResponse({"error": str(e)[:600]}, 502)
    return {"results": out}


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(STATIC / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/icon.svg")
def icon():
    return FileResponse(STATIC / "icon.svg", media_type="image/svg+xml")


if (STATIC / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")


def run() -> None:
    import os

    import uvicorn

    # Local only by default. AI_TRAINER_HOST=0.0.0.0 exposes the app (and your saved API key) to your
    # whole network - there is no login - so only do it on a network you trust, e.g. to open it on a phone.
    host = os.environ.get("AI_TRAINER_HOST", "127.0.0.1")
    if host != "127.0.0.1":
        print(f"WARNING: listening on {host} without authentication. Anyone on your network can use this app.")
    uvicorn.run(app, host=host, port=8765)
