"""Local dev server: the same two stateless endpoints the Vercel functions expose, plus the built SPA.

Run the UI with `cd frontend && npm run dev` (proxies /api here) or build it and open this server.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from ..service import FitRequest, GarminRequest, build_fit_zip, garmin_deliver

DIST = Path(__file__).resolve().parents[3] / "frontend" / "dist"
app = FastAPI(title="AI Trainer for Garmin (local)")


@app.post("/api/fit")
async def fit(request: Request):
    try:
        req = FitRequest.model_validate(await request.json())
    except (ValidationError, ValueError) as e:
        return JSONResponse({"error": f"Invalid workouts: {str(e)[:300]}"}, 400)
    return Response(build_fit_zip(req), media_type="application/zip")


@app.post("/api/garmin")
async def garmin(request: Request):
    try:
        req = GarminRequest.model_validate(await request.json())
    except (ValidationError, ValueError) as e:
        return JSONResponse({"error": f"Invalid request: {str(e)[:300]}"}, 400)
    status, body = garmin_deliver(req)
    return JSONResponse(body, status)


if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")


def run() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
