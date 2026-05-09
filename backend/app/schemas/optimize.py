"""Schemas for the GSC optimisation tool."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ParseCsvIn(BaseModel):
    csv_text: str = Field(..., min_length=1)
    content: str = ""


class TermIn(BaseModel):
    query: str
    count_exact: int = 0
    count_semi: int = 0


class RewriteIn(BaseModel):
    content: str = Field(..., min_length=20)
    terms: list[TermIn] = Field(..., min_length=1, max_length=20)
