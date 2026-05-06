from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_validator


class SiloMemberIn(BaseModel):
    keyword: str
    slug: str | None = None


class SiloCreateIn(BaseModel):
    pillar_keyword: str | None = None
    pillar_external_url: str | None = None
    base_url: str
    trailing_slash: bool = False

    satellites: list[SiloMemberIn] = Field(default_factory=list)

    domain_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
    location_code: int = 2250
    language_code: str = "fr"
    use_haiku: bool = False
    generate_image: bool = False
    do_refinement: bool = False
    do_schema_jsonld: bool = False
    cost_cap: float | None = None

    @field_validator("base_url")
    @classmethod
    def base_url_must_be_absolute(cls, v: str) -> str:
        if not v or not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("base_url must be an absolute http(s) URL")
        return v.strip()

    @field_validator("satellites")
    @classmethod
    def need_satellites(cls, v: list[SiloMemberIn]) -> list[SiloMemberIn]:
        if not v:
            raise ValueError("at least one satellite keyword is required")
        return v


class SiloMemberOut(BaseModel):
    content_id: uuid.UUID
    role: str | None
    keyword: str
    slug: str | None
    url: str
    status: str
    chosen_title: str | None = None
    has_blueprint: bool = False
    has_html: bool = False


class SiloOut(BaseModel):
    id: uuid.UUID
    name: str | None
    pillar_keyword: str | None
    pillar_external_url: str | None
    pillar_content_id: uuid.UUID | None
    base_url: str
    trailing_slash: bool
    domain_id: uuid.UUID | None
    folder_id: uuid.UUID | None
    batch_id: uuid.UUID | None
    status: str
    members: list[SiloMemberOut]
    mesh_audit: dict | None = None


class SiloCreateOut(BaseModel):
    silo_id: uuid.UUID
    batch_id: uuid.UUID
    job_ids: list[uuid.UUID]
