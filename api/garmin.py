"""POST {workouts, email?, password?, tokens?} -> upload to Garmin Connect. Stateless; stores nothing."""
from http.server import BaseHTTPRequestHandler

from _common import read_json, send_json
from pydantic import ValidationError

from ai_trainer_garmin.service import GarminRequest, garmin_deliver


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            req = GarminRequest.model_validate(read_json(self))
        except (ValidationError, ValueError) as e:
            return send_json(self, 400, {"error": f"Invalid request: {str(e)[:300]}"})
        status, body = garmin_deliver(req)
        send_json(self, status, body)
