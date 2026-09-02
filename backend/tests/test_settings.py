from pathlib import Path

from settings import Settings


def test_defaults():
    s = Settings()
    assert s.cors_origins == ["*"]
    assert s.model_cache_dir == Path.home() / ".cache" / "kinetiq"


def test_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv("KINETIQ_MODEL_CACHE_DIR", str(tmp_path))
    monkeypatch.setenv("KINETIQ_CORS_ORIGINS", '["https://a.example","https://b.example"]')
    s = Settings()
    assert s.model_cache_dir == tmp_path
    assert s.cors_origins == ["https://a.example", "https://b.example"]
