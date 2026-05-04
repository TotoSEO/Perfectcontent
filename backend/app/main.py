from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth as auth_router
from app.routers import batches, contents, domains, folders, healthz, jobs


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

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(folders.router, prefix="/api/folders", tags=["folders"])
app.include_router(domains.router, prefix="/api/domains", tags=["domains"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(batches.router, prefix="/api/batches", tags=["batches"])
app.include_router(contents.router, prefix="/api/contents", tags=["contents"])
app.include_router(healthz.router, prefix="/healthz", tags=["healthz"])
