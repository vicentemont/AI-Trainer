"""Shared plumbing for the Vercel Python functions."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


def read_json(handler) -> dict:
    length = int(handler.headers.get("content-length") or 0)
    if length > 2_000_000:
        raise ValueError("Request too large")
    return json.loads(handler.rfile.read(length) or b"{}")


def send(handler, status: int, body: bytes, content_type: str = "application/json", extra=None) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    for k, v in (extra or {}).items():
        handler.send_header(k, v)
    handler.end_headers()
    handler.wfile.write(body)


def send_json(handler, status: int, data: dict) -> None:
    send(handler, status, json.dumps(data).encode())
