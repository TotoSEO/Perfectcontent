"""Diagnostic endpoint that doesn't import anything from backend/.

If GET /srv/diag returns JSON, the Python serverless deploy works.
If it returns the Next.js 500 page, the function isn't deployed at all.
"""
from http.server import BaseHTTPRequestHandler
import json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "from": "vercel-python"}).encode())
