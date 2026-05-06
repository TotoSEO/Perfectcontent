"""Tiny stdlib-only diagnostic endpoint.

Used to confirm Vercel routing reaches a Python function. If GET /diag/ping
returns the JSON body below, the @vercel/python builder is wired correctly.
If it returns the Next.js 500/404 HTML, the route never made it past the
framework handler.

Kept under 1 KB and using only the standard library so it never contributes
to the function bundle size pressure.
"""
from http.server import BaseHTTPRequestHandler
import json


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(
            json.dumps({"ok": True, "from": "diag", "path": self.path}).encode()
        )
