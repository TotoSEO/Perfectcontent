from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from app.auth import clear_session, issue_session, require_session
from app.config import get_settings

router = APIRouter()


class LoginPayload(BaseModel):
    password: str


@router.post("/login")
async def login(payload: LoginPayload, response: Response) -> dict[str, bool]:
    if payload.password != get_settings().app_password:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong password")
    issue_session(response)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response, _: None = Depends(require_session)) -> dict[str, bool]:
    clear_session(response)
    return {"ok": True}


@router.get("/me")
async def me(_: None = Depends(require_session)) -> dict[str, bool]:
    return {"authenticated": True}
