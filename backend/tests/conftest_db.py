import os

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from alembic import command
from settings import settings


def _ensure_test_db() -> None:
    url = make_url(settings.test_database_url)
    admin_url = url.set(database="postgres")
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    try:
        with admin.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database}
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        admin.dispose()


@pytest.fixture(scope="session")
def pg_engine():
    try:
        _ensure_test_db()
        eng = create_engine(settings.test_database_url, future=True)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001, F841
        if os.environ.get("CI"):
            raise
        pytest.skip(
            "Postgres not available — run: docker compose -f backend/docker-compose.yml up -d"
        )
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", settings.test_database_url)
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def db_session(pg_engine) -> Session:
    conn = pg_engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture
def client(db_session):
    import main
    from db.session import get_db

    main.app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(main.app) as c:
            yield c
    finally:
        main.app.dependency_overrides.clear()


@pytest.fixture
def as_user(client, db_session):
    import main
    from auth.dependency import current_user
    from db.models import User

    def _make(**overrides):
        u = User(auth0_sub=overrides.pop("auth0_sub", "auth0|test"), **overrides)
        db_session.add(u)
        db_session.flush()
        main.app.dependency_overrides[current_user] = lambda: u
        return u

    return _make
