"""Stateless operations behind the SPA. Used by the Vercel functions and the local dev server."""
from __future__ import annotations

import io
import re
import zipfile
from typing import Any

from pydantic import BaseModel, Field

from .fit.workout_writer import workout_to_fit
from .garmin.delivery import MfaRequired, deliver_to_connect
from .models import Workout


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")[:40] or "workout"


class FitRequest(BaseModel):
    workouts: list[Workout] = Field(..., min_length=1, max_length=400)


class GarminRequest(BaseModel):
    workouts: list[Workout] = Field(..., min_length=1, max_length=400)
    email: str = ""
    password: str = ""
    tokens: str = ""
    push_days: int = Field(7, ge=0, le=30)


def build_fit_zip(req: FitRequest) -> bytes:
    """One .fit workout file per workout, zipped."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i, w in enumerate(req.workouts, 1):
            prefix = f"{w.scheduled_for:%Y%m%d}_" if w.scheduled_for else f"{i:02d}_"
            z.writestr(f"{prefix}{_slug(w.name)}.fit", workout_to_fit(w))
    return buf.getvalue()


def garmin_deliver(req: GarminRequest) -> tuple[int, dict[str, Any]]:
    """Returns (http_status, json_body). Never logs or stores credentials."""
    if not req.tokens and not (req.email and req.password):
        return 400, {"error": "Enter your Garmin email and password."}
    try:
        return 200, deliver_to_connect(
            req.workouts, email=req.email, password=req.password, tokens=req.tokens, push_days=req.push_days
        )
    except MfaRequired as e:
        return 422, {"error": str(e), "code": "mfa"}
    except Exception as e:
        # keep the message short and never echo request data
        return 502, {"error": f"Garmin Connect rejected the request: {str(e)[:300]}"}
