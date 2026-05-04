from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "dev"
    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    app_password: str
    session_secret: str

    dataforseo_login: str = ""
    dataforseo_password: str = ""
    firecrawl_api_key: str = ""
    jina_api_key: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    fal_api_key: str = ""

    cost_hard_cap_default: float = 1.00
    mock_external: bool = Field(default=False)

    # Comma-separated list of origins, e.g. "https://pc.example.com"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
