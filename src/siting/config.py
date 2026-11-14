"""Runtime settings, read from the environment (12-factor). Prefix SITING_.

SITING_DATA          folder with <aoi>/meta.json (also accepted: SITING_DATA_DIR). Default: data
SITING_CORS_ORIGINS  comma-separated list of allowed origins. Default: none (CORS off)
SITING_LOG_LEVEL     default INFO
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SITING_", env_file=".env", extra="ignore")

    data_dir: Path = Field(Path("data"), validation_alias=AliasChoices("SITING_DATA", "SITING_DATA_DIR"))
    cors_origins: Annotated[list[str], NoDecode] = []
    log_level: str = "INFO"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v
