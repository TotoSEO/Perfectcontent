import time
import traceback
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import require_session
from app.config import get_settings
from app.db import get_db
from app.routers import auth as auth_router
from app.routers import audits, batches, cannibal, contents, domains, folders, fusion, healthz, jobs, logs, semantic_analyses, silos


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    yield


app = FastAPI(title="PerfectContent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Surface every request to Vercel function logs so a hanging or
    crashing endpoint is identifiable from the dashboard.
    Format: [METHOD] /path -> status (Xms) or [METHOD] /path EXC type: msg
    """
    start = time.perf_counter()
    method, path = request.method, request.url.path
    print(f"[{method}] {path} START")
    try:
        response = await call_next(request)
    except Exception as exc:
        ms = int((time.perf_counter() - start) * 1000)
        print(f"[{method}] {path} EXC {type(exc).__name__}: {exc!s} ({ms}ms)")
        raise
    ms = int((time.perf_counter() - start) * 1000)
    print(f"[{method}] {path} -> {response.status_code} ({ms}ms)")
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Surface ANY uncaught error as structured JSON, never as Vercel's blank
    HTML 500 page. Critical for debugging in serverless."""
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "stage": "request",
            "path": str(request.url.path),
            "method": request.method,
            "error_type": type(exc).__name__,
            "error": str(exc),
            "traceback": traceback.format_exc().splitlines()[-12:],
        },
    )


@app.get("/srv/diag/db")
async def diag_db() -> dict:
    """Comprehensive DB diagnostic. Tests both the SQLAlchemy stack and
    raw psycopg connection so we can pinpoint where the failure is.
    """
    import os
    from urllib.parse import urlparse
    from sqlalchemy import text
    from app.db import SessionLocal, _clean_url, _ssl_extra

    raw = os.environ.get("DATABASE_URL", "")
    parsed = urlparse(raw)
    masked = (
        f"{parsed.scheme}://{parsed.username}:***@"
        f"{parsed.hostname}:{parsed.port}{parsed.path}"
        f"{'?' + parsed.query if parsed.query else ''}"
    )

    out: dict = {
        "raw_scheme": parsed.scheme,
        "raw_host": parsed.hostname,
        "raw_port": parsed.port,
        "raw_db": parsed.path,
        "raw_user": parsed.username,
        "raw_query": parsed.query,
        "masked_url": masked,
        "normalized_url": _clean_url.split("@")[-1] if "@" in _clean_url else _clean_url,
        "connect_args_keys": list(_ssl_extra.keys()),
        "tests": {},
    }

    # Test 1: SQLAlchemy SELECT 1
    try:
        async with SessionLocal() as session:
            result = await session.execute(text("SELECT 1 AS ok"))
            row = result.first()
            out["tests"]["sqlalchemy"] = {"ok": True, "result": row[0] if row else None}
    except Exception as exc:  # noqa: BLE001
        out["tests"]["sqlalchemy"] = {
            "ok": False,
            "error_type": type(exc).__name__,
            "error": str(exc)[:500],
        }

    # Test 2: raw psycopg (bypasses SQLAlchemy entirely)
    try:
        import psycopg
        from urllib.parse import urlunparse, urlparse as _up
        # strip the +psycopg suffix from scheme — psycopg wants plain postgresql://
        plain_scheme_url = raw
        if "+psycopg" in raw:
            plain_scheme_url = raw.replace("+psycopg", "")
        if "+asyncpg" in plain_scheme_url:
            plain_scheme_url = plain_scheme_url.replace("+asyncpg", "")
        async with await psycopg.AsyncConnection.connect(plain_scheme_url, connect_timeout=8) as conn:  # type: ignore[arg-type]
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
                row = await cur.fetchone()
                out["tests"]["psycopg_raw"] = {"ok": True, "result": row[0] if row else None}
    except Exception as exc:  # noqa: BLE001
        out["tests"]["psycopg_raw"] = {
            "ok": False,
            "error_type": type(exc).__name__,
            "error": str(exc)[:500],
        }

    return out


@app.post("/srv/diag/echo")
async def diag_echo(request: Request) -> dict:
    """Pure echo endpoint — no auth, no DB, no validation. If POSTing here
    returns JSON, FastAPI POST routing works and the issue is elsewhere
    (specific handler timing out, DB op failing, auth crashing, etc.)."""
    body = await request.body()
    return {
        "ok": True,
        "method": request.method,
        "path": str(request.url.path),
        "received_bytes": len(body),
        "content_type": request.headers.get("content-type"),
    }


@app.get("/srv/diag/echo")
async def diag_echo_get(request: Request) -> dict:
    """GET sibling so the user can hit both verbs from the URL bar."""
    return {
        "ok": True,
        "method": request.method,
        "path": str(request.url.path),
    }


@app.post("/srv/diag/auth")
async def diag_auth(_: None = Depends(require_session)) -> dict:
    """POST + auth dependency, NO DB. If this returns JSON, the auth
    dependency works on POST. If this fails with HTML, the auth check
    is what's blocking authenticated POSTs."""
    return {"ok": True, "auth": "passed"}


@app.post("/srv/diag/auth-db")
async def diag_auth_db(_: None = Depends(require_session)) -> dict:
    """POST + auth + a single DB SELECT 1. Reproduces the minimum
    surface that silo / jobs / audits POSTs all share. If this returns
    JSON, the silo/jobs handlers are the issue (heavy DB writes). If
    it fails, the auth+DB combination is what's broken on POST."""
    from sqlalchemy import text
    from app.db import SessionLocal
    async with SessionLocal() as session:
        result = await session.execute(text("SELECT 1 AS ok"))
        row = result.first()
    return {
        "ok": True,
        "auth": "passed",
        "db_select_1": row[0] if row else None,
    }


app.include_router(auth_router.router, prefix="/srv/auth", tags=["auth"])
app.include_router(folders.router, prefix="/srv/folders", tags=["folders"])
app.include_router(domains.router, prefix="/srv/domains", tags=["domains"])
app.include_router(jobs.router, prefix="/srv/jobs", tags=["jobs"])
app.include_router(batches.router, prefix="/srv/batches", tags=["batches"])
app.include_router(contents.router, prefix="/srv/contents", tags=["contents"])
app.include_router(fusion.router, prefix="/srv/fusion", tags=["fusion"])
app.include_router(logs.router, prefix="/srv/logs", tags=["logs"])
app.include_router(silos.router, prefix="/srv/silos", tags=["silos"])
app.include_router(audits.router, prefix="/srv/audits", tags=["audits"])
app.include_router(cannibal.router, prefix="/srv/cannibalization", tags=["cannibalization"])
app.include_router(semantic_analyses.router, prefix="/srv/semantic-analyses", tags=["semantic-analyses"])
app.include_router(healthz.router, prefix="/healthz", tags=["healthz"])
