"""Lightweight pgvector type — drop-in replacement for pgvector.sqlalchemy.Vector
that doesn't pull numpy (~73 MB on Linux x86_64) into the Lambda bundle.

Postgres accepts vectors in the textual form '[v1,v2,…]'::vector. We only ever
bind list[float] from embedding APIs, so a tiny TypeDecorator is enough. Read
back is rare (we only do server-side similarity SELECTs), but supported.
"""
from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy.types import UserDefinedType


class Vector(UserDefinedType):
    cache_ok = True

    def __init__(self, dim: int | None = None) -> None:
        self.dim = dim

    def get_col_spec(self, **kw: Any) -> str:  # noqa: D401
        return f"VECTOR({self.dim})" if self.dim else "VECTOR"

    def bind_processor(self, dialect: Any):
        def process(value: Sequence[float] | str | None) -> str | None:
            if value is None:
                return None
            if isinstance(value, str):
                return value
            return "[" + ",".join(repr(float(x)) for x in value) + "]"

        return process

    def result_processor(self, dialect: Any, coltype: Any):
        def process(value: Any) -> list[float] | None:
            if value is None:
                return None
            if isinstance(value, list):
                return value
            s = str(value).strip()
            if s.startswith("[") and s.endswith("]"):
                s = s[1:-1]
            if not s:
                return []
            return [float(x) for x in s.split(",")]

        return process
