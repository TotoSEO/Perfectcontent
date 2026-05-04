from fastapi import Cookie, HTTPException, Response, status
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.config import get_settings

COOKIE_NAME = "pc_session"
MAX_AGE = 60 * 60 * 24 * 30  # 30 days


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt="pc-auth")


def issue_session(response: Response) -> None:
    token = _serializer().dumps({"ok": True})
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=get_settings().env == "prod",
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME)


def require_session(pc_session: str | None = Cookie(default=None, alias=COOKIE_NAME)) -> None:
    if not pc_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    try:
        _serializer().loads(pc_session, max_age=MAX_AGE)
    except BadSignature as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid session") from exc
