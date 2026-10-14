"""POST {workouts:[...]} -> application/zip of .fit workout files. GET returns a diagnostic."""
import json
import os
import platform
import sys
import traceback
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

try:
    from pydantic import ValidationError

    from ai_trainer_garmin.service import FitRequest, build_fit_zip
    IMPORT_ERROR = None
except Exception:
    IMPORT_ERROR = traceback.format_exc()[-1500:]


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, data: dict) -> None:
        self._send(status, json.dumps(data).encode())

    def do_GET(self):
        self._json(200, {"python": platform.python_version(), "import_error": IMPORT_ERROR})

    def do_POST(self):
        if IMPORT_ERROR:
            return self._json(500, {"error": f"Server setup problem: {IMPORT_ERROR.strip().splitlines()[-1]}"})
        try:
            length = int(self.headers.get("content-length") or 0)
            if length > 4_000_000:
                return self._json(413, {"error": "Request too large"})
            req = FitRequest.model_validate(json.loads(self.rfile.read(length) or b"{}"))
        except (ValidationError, ValueError) as e:
            return self._json(400, {"error": f"Invalid workouts: {str(e)[:300]}"})
        try:
            self._send(200, build_fit_zip(req), "application/zip")
        except Exception as e:
            self._json(500, {"error": f"Unexpected server error: {type(e).__name__}: {str(e)[:200]}"})
