"""Tiny stdlib-only diagnostic endpoint.

Two probes:
  GET  /diag/ping   -> confirms Python routing reaches the function.
  POST /diag/post   -> confirms POST + body parsing works (echoes back the
                       received content-length and a few request properties).

Returns JSON; uses only the standard library so it stays under the function
size budget regardless of what we add to the main app's requirements.
"""
from http.server import BaseHTTPRequestHandler
import json


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        self._reply(200, {"ok": True, "method": "GET", "from": "diag", "path": self.path})

    def do_POST(self) -> None:  # noqa: N802
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length > 0 else b""
        ct = self.headers.get("content-type") or ""
        self._reply(
            200,
            {
                "ok": True,
                "method": "POST",
                "from": "diag",
                "path": self.path,
                "content_type": ct,
                "received_bytes": len(body),
            },
        )

    def _reply(self, status: int, payload: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
