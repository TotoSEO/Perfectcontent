import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import auth as auth_router
from app.routers import batches, contents, domains, folders, fusion, healthz, jobs, logs


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
    """Test the database connection and return the result."""
    from sqlalchemy import text
    from app.db import SessionLocal
    try:
        async with SessionLocal() as session:
            result = await session.execute(text("SELECT 1 AS ok"))
            row = result.first()
            return {"ok": True, "result": row[0] if row else None}
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error_type": type(exc).__name__,
            "error": str(exc),
            "hint": (
                "Le scheme doit être 'postgresql+asyncpg://...'. Si t'as gardé "
                "'postgresql://...' (sans +asyncpg), c'est ça l'erreur."
            ),
        }


app.include_router(auth_router.router, prefix="/srv/auth", tags=["auth"])
app.include_router(folders.router, prefix="/srv/folders", tags=["folders"])
app.include_router(domains.router, prefix="/srv/domains", tags=["domains"])
app.include_router(jobs.router, prefix="/srv/jobs", tags=["jobs"])
app.include_router(batches.router, prefix="/srv/batches", tags=["batches"])
app.include_router(contents.router, prefix="/srv/contents", tags=["contents"])
app.include_router(fusion.router, prefix="/srv/fusion", tags=["fusion"])
app.include_router(logs.router, prefix="/srv/logs", tags=["logs"])
app.include_router(healthz.router, prefix="/healthz", tags=["healthz"])
