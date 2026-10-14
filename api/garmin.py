"""POST {workouts, email?, password?, tokens?} -> upload to Garmin Connect. Stateless; stores nothing.

GET returns a small diagnostic (python version, whether dependencies import) to debug deployments.
"""
import json
import os
import platform
import sys
import traceback
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

try:
    from pydantic import ValidationError

    from ai_trainer_garmin.service import GarminRequest, garmin_deliver
    IMPORT_ERROR = None
except Exception:  # report the real cause instead of an opaque 500
    IMPORT_ERROR = traceback.format_exc()[-1500:]


def _deps() -> dict:
    out = {}
    for mod in ("pydantic", "garminconnect", "curl_cffi", "fit_tool"):
        try:
            __import__(mod)
            out[mod] = "ok"
        except Exception as e:
            out[mod] = f"{type(e).__name__}: {str(e)[:200]}"
    return out


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200, {"python": platform.python_version(), "import_error": IMPORT_ERROR, "deps": _deps()})

    def do_POST(self):
        if IMPORT_ERROR:
            return self._send(500, {"error": f"Server setup problem: {IMPORT_ERROR.strip().splitlines()[-1]}"})
        try:
            length = int(self.headers.get("content-length") or 0)
            if length > 4_000_000:
                return self._send(413, {"error": "Request too large"})
            req = GarminRequest.model_validate(json.loads(self.rfile.read(length) or b"{}"))
        except (ValidationError, ValueError) as e:
            return self._send(400, {"error": f"Invalid request: {str(e)[:300]}"})
        try:
            status, body = garmin_deliver(req)
        except Exception as e:  # last resort; never include request data
            return self._send(500, {"error": f"Unexpected server error: {type(e).__name__}: {str(e)[:200]}"})
        self._send(status, body)
