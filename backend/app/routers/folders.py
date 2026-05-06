from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Folder
from app.schemas.folder import FolderIn, FolderOut, FolderUpdate

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("", response_model=list[FolderOut])
async def list_folders(db: AsyncSession = Depends(get_db)) -> list[Folder]:
    return list((await db.execute(select(Folder).order_by(Folder.name))).scalars().all())


@router.post("", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
async def create_folder(payload: FolderIn, db: AsyncSession = Depends(get_db)) -> Folder:
    folder = Folder(name=payload.name, parent_id=payload.parent_id)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


@router.get("/{folder_id}", response_model=FolderOut)
async def get_folder(folder_id: UUID, db: AsyncSession = Depends(get_db)) -> Folder:
    folder = await db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "folder not found")
    return folder


@router.patch("/{folder_id}", response_model=FolderOut)
async def update_folder(
    folder_id: UUID, payload: FolderUpdate, db: AsyncSession = Depends(get_db)
) -> Folder:
    folder = await db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "folder not found")
    if payload.name is not None:
        folder.name = payload.name
    if payload.parent_id is not None:
        folder.parent_id = payload.parent_id
    await db.commit()
    await db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(folder_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    folder = await db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "folder not found")
    await db.delete(folder)
    await db.commit()
