from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KINETIQ_", env_file=".env", extra="ignore")

    model_cache_dir: Path = Path.home() / ".cache" / "kinetiq"
    cors_origins: list[str] = ["*"]
    database_url: str = "postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq"
    test_database_url: str = "postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq_test"
    auth0_domain: str = ""
    studio_media_dir: Path = Path(__file__).resolve().parent / ".studio-media"
    studio_upload_limit_mb: int = 150
    studio_analysis_timeout_seconds: int = 180
    studio_ball_enabled: bool = True


settings = Settings()
