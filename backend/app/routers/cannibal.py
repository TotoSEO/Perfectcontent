"""Cannibalization audit endpoint.

POST /srv/cannibalization/audit  →  CannibalReport (dict)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.schemas.cannibal import CannibalAuditIn
from app.services import cannibal_audit

router = APIRouter(dependencies=[Depends(require_session)])


@router.post("/audit")
async def run_audit(payload: CannibalAuditIn, db: AsyncSession = Depends(get_db)) -> dict:
    req = cannibal_audit.CannibalRequest(
        keyword=payload.keyword,
        url_a=str(payload.url_a),
        url_b=str(payload.url_b),
        location_code=payload.location_code,
        language_code=payload.language_code,
        gsc_a=cannibal_audit.GscStats(**payload.gsc_a.model_dump()) if payload.gsc_a else None,
        gsc_b=cannibal_audit.GscStats(**payload.gsc_b.model_dump()) if payload.gsc_b else None,
        backlinks_a=payload.backlinks_a,
        backlinks_b=payload.backlinks_b,
    )
    report = await cannibal_audit.audit(req, db)
    return report.to_dict()
