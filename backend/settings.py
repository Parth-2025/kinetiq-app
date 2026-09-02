from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KINETIQ_", env_file=".env", extra="ignore")

    model_cache_dir: Path = Path.home() / ".cache" / "kinetiq"
    cors_origins: list[str] = ["*"]


settings = Settings()
