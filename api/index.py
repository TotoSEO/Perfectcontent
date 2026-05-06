"""Vercel Python serverless entry point.

Wraps the FastAPI app import in a try/except so that an import error doesn't
just produce an opaque 500 — instead, the caller sees a JSON body with the
exception type, message and stack trace. Greatly speeds up debugging in
production where Vercel's function logs may not be easily accessible.
"""
import json
import os
import sys
import traceback
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

_app = None
_import_error: dict | None = None

try:
    from app.main import app as _app  # noqa: F401
except Exception as exc:  # noqa: BLE001
    _import_error = {
        "ok": False,
        "stage": "import",
        "error_type": type(exc).__name__,
        "error": str(exc),
        "traceback": traceback.format_exc().splitlines(),
        "env_seen": sorted(
            k for k in os.environ.keys()
            if k.startswith(("DATABASE_", "APP_", "SESSION_", "DATAFORSEO_",
                             "FIRECRAWL_", "ANTHROPIC_", "OPENAI_", "FAL_",
                             "ENV", "CORS_", "MOCK_"))
        ),
        "backend_dir_exists": _backend_dir.exists(),
        "backend_app_exists": (_backend_dir / "app" / "main.py").exists(),
    }


if _import_error is not None:
    # Provide a tiny ASGI app that responds to ANY request with the diagnostic.
    async def app(scope, receive, send):  # type: ignore[no-redef]
        if scope["type"] != "http":
            return
        body = json.dumps(_import_error, indent=2, default=str).encode()
        await send({
            "type": "http.response.start",
            "status": 500,
            "headers": [(b"content-type", b"application/json")],
        })
        await send({"type": "http.response.body", "body": body})
else:
    # Last-resort wrapper. FastAPI's @exception_handler should catch every
    # error in route handlers, but if anything escapes (e.g. a low-level
    # psycopg exception during commit() that doesn't propagate cleanly
    # through SQLAlchemy's async layer), it bubbles up to Vercel as
    # FUNCTION_INVOCATION_FAILED → opaque HTML 500. This wrapper ensures the
    # user always gets the JSON error type + message on the wire.
    _real_app = _app

    async def app(scope, receive, send):  # type: ignore[no-redef]
        if scope["type"] != "http":
            await _real_app(scope, receive, send)
            return
        response_started = False

        async def _send_wrapper(message):
            nonlocal response_started
            if message.get("type") == "http.response.start":
                response_started = True
            await send(message)

        try:
            await _real_app(scope, receive, _send_wrapper)
        except Exception as exc:  # noqa: BLE001
            payload = {
                "ok": False,
                "stage": "asgi-tail",
                "error_type": type(exc).__name__,
                "error": str(exc),
                "traceback": traceback.format_exc().splitlines()[-15:],
                "method": scope.get("method"),
                "path": scope.get("path"),
            }
            body = json.dumps(payload, default=str).encode()
            if not response_started:
                await send({
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [(b"content-type", b"application/json")],
                })
                await send({"type": "http.response.body", "body": body})
            # If the response already started, we can't send a new header;
            # at least surface the error in stdout so it's in Vercel logs.
            print(f"[ASGI-TAIL] {payload}", flush=True)
