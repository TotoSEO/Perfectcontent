"""Vercel Python serverless entry point.

This file is the single ASGI handler that Vercel routes ALL /api/* and
/healthz/* requests to (see vercel.json rewrites).

We import the FastAPI app from the backend package. Vercel's Python runtime
recognizes the `app` symbol at module level as the ASGI handler.
"""
import sys
from pathlib import Path

# Make the backend importable as `app.*`
_backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from app.main import app  # noqa: E402,F401
