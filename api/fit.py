"""POST {workouts:[...]} -> application/zip of .fit workout files."""
from http.server import BaseHTTPRequestHandler

from _common import read_json, send, send_json
from pydantic import ValidationError

from ai_trainer_garmin.service import FitRequest, build_fit_zip


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            req = FitRequest.model_validate(read_json(self))
        except (ValidationError, ValueError) as e:
            return send_json(self, 400, {"error": f"Invalid workouts: {str(e)[:300]}"})
        send(self, 200, build_fit_zip(req), "application/zip")
