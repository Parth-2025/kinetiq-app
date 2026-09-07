from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KINETIQ_", env_file=".env", extra="ignore")

    model_cache_dir: Path = Path.home() / ".cache" / "kinetiq"
    cors_origins: list[str] = ["*"]
    database_url: str = "postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq"
    test_database_url: str = "postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq_test"
    auth0_domain: str = ""


settings = Settings()
