from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Content, Silo
from app.schemas.silo import (
    SiloCreateIn,
    SiloCreateOut,
    SiloMemberOut,
    SiloOut,
)
from app.services import silo as silo_svc
from app.services.slug import join_url

router = APIRouter(dependencies=[Depends(require_session)])


def _validate_pillar_choice(payload: SiloCreateIn) -> None:
    has_kw = bool(payload.pillar_keyword and payload.pillar_keyword.strip())
    has_url = bool(payload.pillar_external_url and payload.pillar_external_url.strip())
    if has_kw == has_url:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "exactly one of pillar_keyword OR pillar_external_url must be set",
        )


@router.post("", response_model=SiloCreateOut, status_code=status.HTTP_201_CREATED)
async def create_silo(payload: SiloCreateIn, db: AsyncSession = Depends(get_db)) -> SiloCreateOut:
    _validate_pillar_choice(payload)
    plan = silo_svc.SiloPlan(
        base_url=payload.base_url,
        trailing_slash=payload.trailing_slash,
        pillar_keyword=payload.pillar_keyword,
        pillar_external_url=payload.pillar_external_url,
        satellites=[silo_svc.SiloMemberSpec(keyword=s.keyword, slug=s.slug) for s in payload.satellites],
        domain_id=payload.domain_id,
        folder_id=payload.folder_id,
        location_code=payload.location_code,
        language_code=payload.language_code,
        use_haiku=payload.use_haiku,
        generate_image=payload.generate_image,
        cost_cap=payload.cost_cap,
    )
    silo, jobs = await silo_svc.create_silo(db, plan)
    return SiloCreateOut(
        silo_id=silo.id,
        batch_id=silo.batch_id,
        job_ids=[j.id for j in jobs],
    )


async def _build_silo_out(db: AsyncSession, silo: Silo) -> SiloOut:
    members = list(
        (
            await db.execute(select(Content).where(Content.silo_id == silo.id))
        ).scalars().all()
    )
    out_members: list[SiloMemberOut] = []
    for m in members:
        out_members.append(SiloMemberOut(
            content_id=m.id,
            role=m.silo_role,
            keyword=m.keyword,
            slug=m.slug,
            url=join_url(silo.base_url, m.slug or "", trailing_slash=silo.trailing_slash),
            status=m.status,
            chosen_title=m.chosen_title,
            has_blueprint=bool(m.blueprint),
            has_html=bool(m.html),
        ))
    # Sort: pillar first, then satellites alphabetically
    out_members.sort(key=lambda x: (0 if x.role == "pillar" else 1, x.keyword.lower()))
    return SiloOut(
        id=silo.id,
        name=silo.name,
        pillar_keyword=silo.pillar_keyword,
        pillar_external_url=silo.pillar_external_url,
        pillar_content_id=silo.pillar_content_id,
        base_url=silo.base_url,
        trailing_slash=silo.trailing_slash,
        domain_id=silo.domain_id,
        folder_id=silo.folder_id,
        batch_id=silo.batch_id,
        status=silo.status,
        members=out_members,
        mesh_audit=silo.mesh_audit,
    )


@router.get("/{silo_id}", response_model=SiloOut)
async def get_silo(silo_id: UUID, db: AsyncSession = Depends(get_db)) -> SiloOut:
    silo = await db.get(Silo, silo_id)
    if silo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "silo not found")
    return await _build_silo_out(db, silo)


@router.get("", response_model=list[SiloOut])
async def list_silos(db: AsyncSession = Depends(get_db)) -> list[SiloOut]:
    silos = list(
        (await db.execute(select(Silo).order_by(Silo.created_at.desc()))).scalars().all()
    )
    return [await _build_silo_out(db, s) for s in silos]


@router.post("/{silo_id}/manifest")
async def build_manifest(silo_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Compute pairwise cosine on member blueprints + persist link manifests.
    Browser calls this once every member has reached blueprint=done."""
    try:
        return await silo_svc.build_manifest(db, silo_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.post("/{silo_id}/validate")
async def validate_mesh(silo_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await silo_svc.validate_mesh(db, silo_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.delete("/{silo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_silo(silo_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    silo = await db.get(Silo, silo_id)
    if silo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "silo not found")
    await db.delete(silo)
    await db.commit()
