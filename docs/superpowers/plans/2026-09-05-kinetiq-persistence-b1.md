# KinetiQ Persistence Layer B1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Postgres persistence layer behind the existing FastAPI service (users, sports selection, analysis sessions, derived stats) and move the Expo frontend off `firebase/database` onto that API.

**Architecture:** New `db/`, `auth/`, `routers/` packages in `backend/`, independent of `analyzer/`. SQLAlchemy 2.0 (sync) + Alembic. Every request carries the user's Auth0 access token as a Bearer header; a `current_user` dependency validates it against Auth0 `/userinfo` (5-min in-process cache) and resolves it to a `users` row. Frontend gets a `config/api.ts` client + `hooks/use-api.ts` (`useApiQuery` / `useApiMutation`, same shape as the old Firebase hooks, refetch-on-focus + invalidate-after-mutation); the `firebase` dependency is removed and B2 features are parked on a throwing stub.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic, psycopg 3, httpx, pytest, Postgres 16; Expo Router + TypeScript (frontend).

**Spec:** `docs/superpowers/specs/2026-09-05-kinetiq-persistence-b1-design.md`

## Global Constraints

- Backend Python 3.11 (`ruff target-version = "py311"`); MediaPipe has no 3.13 wheels.
- `ruff check .` from `backend/` stays clean: `select = ["E", "F", "I", "UP", "B"]`, `ignore = ["E501"]`, `line-length = 100`, `src = ["."]`.
- Backend tests run `cd backend && python -m pytest`, `pythonpath = ["."]`.
- New backend deps pinned: `sqlalchemy~=2.0`, `alembic~=1.13`, `psycopg[binary]~=3.2`; `httpx~=0.28` moves from `requirements-dev.txt` to `requirements.txt`.
- Nothing under `backend/analyzer/**` may import `db`, `auth`, or `routers`. A `tests/test_layering.py` guard enforces this.
- The `/analyze` pipeline and every existing analyzer test are untouched and stay green.
- Frontend: TypeScript `strict`; `npx tsc --noEmit` and `npx expo lint` clean. No new frontend runtime dependency for the data layer (custom hooks, not TanStack Query). No frontend test runner is added (there is none today) — `tsc --noEmit` + `expo lint` are the frontend gate.
- Auth0 PKCE flow in `context/auth-context.tsx` is unchanged except the access token is also held in context state and exposed via an accessor.
- No data migration (Firebase is unreachable — clean start).
- Branch `persistence-b1` (stacked on `multisport-architecture`), never `main`. Commits attributed to Parth Mohan <parthmohan2006@gmail.com>.

## Plan decisions (made while writing this plan)

- **Sync SQLAlchemy**, sync `def` routes (FastAPI threadpools them). `current_user` is `async def` (it awaits `httpx`), and does its small DB read inline — acceptable for a hobby-scale query, documented.
- **DB-test skip policy:** the `pg_engine` fixture connects to `KINETIQ_TEST_DATABASE_URL`; on failure it raises when `os.environ.get("CI")` is set, else `pytest.skip("Postgres not available — run: docker compose -f backend/docker-compose.yml up -d")`. So `pytest -m "not mediapipe"` works locally without Postgres (DB tests skip) and always runs them in CI.
- **`services/user-profile.ts` is kept, stripped to the firebase-free pure helpers** (`normalizeUsernameInput`, `isValidUsername`, `getUsernameValidationMessage`) + the `AppUserProfile` type. Its `claimUsername` / `getUserProfilePath` / firebase import are removed.
- Frontend username input allows `.` (period) as today (`^[a-z0-9._]+$`); the **backend** stores/validates `^[a-z0-9_]{3,20}$` per the spec, so `config/api.ts` callers must strip periods before `PATCH /me/profile`. The plan's Task 10 maps period→removed in the sports/profile screen submit path and notes it.

---

## File Structure

### Backend — created

| File | Responsibility |
|---|---|
| `backend/db/__init__.py` | empty package marker |
| `backend/db/session.py` | `engine`, `SessionLocal`, `get_db()` FastAPI dependency |
| `backend/db/models.py` | `Base`, `User`, `UserSport`, `AnalysisSession` (SQLAlchemy 2.0 declarative) |
| `backend/auth/__init__.py` | empty package marker |
| `backend/auth/dependency.py` | `_TokenCache`, `AUTH_CACHE_TTL`, `current_user()` dependency |
| `backend/routers/__init__.py` | empty package marker |
| `backend/routers/profile.py` | `GET /me`, `PATCH /me/profile`, `GET /me/username-available` |
| `backend/routers/sports.py` | `GET /me/sports`, `PUT /me/sports/active`, `POST /me/sports/selected`, `DELETE /me/sports/selected/{sport}` |
| `backend/routers/sessions.py` | `POST /me/sessions`, `GET /me/sessions`, `GET /me/sessions/{id}`, `GET /me/sessions/active` |
| `backend/routers/stats.py` | `GET /me/stats` + the ported level/exp formula |
| `backend/alembic.ini` | Alembic config (URL comes from env in `env.py`) |
| `backend/alembic/env.py` | Alembic online-migration runner bound to `db.models.Base.metadata` and `settings.database_url` |
| `backend/alembic/script.py.mako` | standard Alembic template |
| `backend/alembic/versions/0001_initial.py` | create `pgcrypto`, the three tables, indexes, circular FK |
| `backend/docker-compose.yml` | `postgres:16` for local dev + tests |
| `backend/render.yaml` | Render web service + `alembic upgrade head` pre-deploy |
| `backend/tests/conftest_db.py` | `pg_engine`, `db_session`, `client`, `as_user` fixtures (imported by `conftest.py`) |
| `backend/tests/test_models.py` | schema round-trip + circular FK |
| `backend/tests/test_auth.py` | `_TokenCache` + `current_user` behaviour |
| `backend/tests/test_profile.py` | profile router |
| `backend/tests/test_sports.py` | sports router |
| `backend/tests/test_sessions.py` | sessions router |
| `backend/tests/test_stats.py` | stats router + level table |
| `backend/tests/test_layering.py` | `analyzer/**` imports no persistence module |

### Backend — modified

| File | Change |
|---|---|
| `backend/settings.py` | + `database_url: str`, `auth0_domain: str`, `test_database_url: str` |
| `backend/main.py` | include the four routers; startup DB ping (log-and-continue) |
| `backend/requirements.txt` | + sqlalchemy, alembic, psycopg; + httpx (moved from dev) |
| `backend/requirements-dev.txt` | drop the now-runtime httpx line (keep `-r requirements.txt`) |
| `backend/pyproject.toml` | `[tool.pytest.ini_options]` unchanged except a `db` marker is **not** added (see skip policy) |
| `backend/tests/conftest.py` | `from tests.conftest_db import *  # noqa: F401,F403` |
| `backend/CHANGES.md` | new "## 7. Persistence layer (B1)" section |
| `backend/README.md` | DB setup + env vars + `alembic upgrade head` |
| `.github/workflows/ci.yml` | add a `postgres:16` service + `KINETIQ_TEST_DATABASE_URL`; run `alembic upgrade head` before pytest |

### Frontend — created

| File | Responsibility |
|---|---|
| `frontend/config/api.ts` | `apiFetch(path, init?)`, `ApiError`, `registerTokenAccessor(fn)` |
| `frontend/hooks/use-api.ts` | `useApiQuery`, `useApiMutation`, `invalidate`, module cache |

### Frontend — modified

| File | Change |
|---|---|
| `frontend/context/auth-context.tsx` | keep `accessToken` in state; `registerTokenAccessor(() => accessToken)` on mount |
| `frontend/config/firebase.ts` | replaced with a stub: `db` getter throws `"persistence for this feature returns in B2"` |
| `frontend/config/runtime.ts` | drop the seven `firebase*` keys |
| `frontend/services/user-profile.ts` | strip to pure helpers + `AppUserProfile` type; no firebase import |
| `frontend/app/sports.tsx` | `/me/sports` via `useApiQuery`; add/activate via `useApiMutation` |
| `frontend/app/(tabs)/index.tsx` | active sport from `/me/sports` |
| `frontend/app/(tabs)/upload.tsx` | active sport from `/me/sports`; after `analyzeVideo`, `POST /me/sessions`; `latestSessionId` from the POST result |
| `frontend/app/shot-breakdown.tsx` | `GET /me/sessions/active` or `/me/sessions/{id}` |
| `frontend/app/phase-detail.tsx` | `GET /me/sessions/{id}` |
| `frontend/app/player-stats.tsx` | `GET /me/sessions` list + `GET /me/stats` |
| `frontend/hooks/use-user-profile.ts` | `GET /me` |
| `frontend/hooks/use-user-stats.ts` | `GET /me/stats` |
| `frontend/app/(tabs)/leaderboard.tsx` | render a "coming back soon" state; stop calling firebase |
| `frontend/app/friends/add.tsx` | render a "coming back soon" state; stop calling firebase |
| `frontend/hooks/use-social-inbox.ts` | short-circuit to an empty/disabled state; stop calling firebase |
| `frontend/hooks/use-profile-customization.ts` | short-circuit to a default state; stop calling firebase |
| `frontend/package.json` | remove `firebase` from `dependencies` |

### Frontend — deleted

`frontend/hooks/use-database.ts`, `frontend/services/user-stats.ts`, `frontend/services/analysis-sessions.ts`.

---

## Task 1: Persistence substrate

**Files:**
- Create: `backend/db/__init__.py`, `backend/db/session.py`, `backend/docker-compose.yml`, `backend/tests/conftest_db.py`
- Modify: `backend/settings.py`, `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/tests/conftest.py`, `.github/workflows/ci.yml`
- Test: `backend/tests/test_db_session.py`

**Interfaces:**
- Produces:
  - `settings.settings.database_url: str`, `settings.settings.auth0_domain: str`, `settings.settings.test_database_url: str`
  - `db.session.engine` (SQLAlchemy `Engine`), `db.session.SessionLocal` (`sessionmaker[Session]`), `db.session.get_db() -> Iterator[Session]` (FastAPI dependency, commits on clean exit, rolls back on exception, always closes)
  - pytest fixtures (in `conftest_db.py`, re-exported by `conftest.py`): `pg_engine` (session-scoped `Engine` on `test_database_url`, skip/raise per policy), `db_session` (function-scoped `Session` in a rolled-back transaction)

- [ ] **Step 1: Add dependencies**

`backend/requirements.txt` — append:
```
sqlalchemy~=2.0
alembic~=1.13
psycopg[binary]~=3.2
httpx~=0.28
```
`backend/requirements-dev.txt` — remove the `httpx~=0.28` line (now in `requirements.txt`); the file keeps `-r requirements.txt` and the pytest/ruff lines.

Run: `cd backend && pip install -r requirements-dev.txt`

- [ ] **Step 2: Extend settings**

`backend/settings.py` — add three fields to `Settings`:
```python
    database_url: str = "postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq"
    test_database_url: str = "postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq_test"
    auth0_domain: str = ""
```
Env vars are `KINETIQ_DATABASE_URL`, `KINETIQ_TEST_DATABASE_URL`, `KINETIQ_AUTH0_DOMAIN` (prefix already configured).

- [ ] **Step 3: Write `backend/db/__init__.py`**

Empty file.

- [ ] **Step 4: Write `backend/db/session.py`**

```python
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from settings import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```

- [ ] **Step 5: Write `backend/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: kinetiq
      POSTGRES_PASSWORD: kinetiq
      POSTGRES_DB: kinetiq
    ports:
      - "5432:5432"
    volumes:
      - kinetiq_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kinetiq"]
      interval: 3s
      timeout: 3s
      retries: 10

volumes:
  kinetiq_pg:
```

A second database `kinetiq_test` is created by the test fixture (Step 7) via `CREATE DATABASE` if missing.

- [ ] **Step 6: Write `backend/tests/test_db_session.py`**

```python
from sqlalchemy import text

from db.session import SessionLocal, get_db


def test_get_db_yields_and_commits(pg_engine):
    gen = get_db()
    db = next(gen)
    db.execute(text("SELECT 1"))
    # exhaust the generator -> commit + close, no error
    try:
        next(gen)
    except StopIteration:
        pass


def test_sessionlocal_bound_to_engine():
    with SessionLocal() as s:
        assert s.execute(text("SELECT 1")).scalar_one() == 1
```

- [ ] **Step 7: Write `backend/tests/conftest_db.py`**

```python
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

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
    except Exception as exc:  # noqa: BLE001
        if os.environ.get("CI"):
            raise
        pytest.skip(
            "Postgres not available — run: docker compose -f backend/docker-compose.yml up -d"
        )
    # migrations are applied by the test task that needs models (Task 2 adds the call)
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
```

(`client` and `as_user` fixtures are added to this file in Task 3, once `auth` and `main.app` exist.)

- [ ] **Step 8: Wire `conftest_db` into `conftest.py`**

`backend/tests/conftest.py` — add at the top after the existing imports:
```python
from tests.conftest_db import db_session, pg_engine  # noqa: F401
```

- [ ] **Step 9: Add Postgres to CI**

`.github/workflows/ci.yml` — under `jobs.test`, add a `services` block and an env var, and (in Task 2) a migration step. For now:
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: kinetiq
          POSTGRES_PASSWORD: kinetiq
          POSTGRES_DB: kinetiq
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U kinetiq"
          --health-interval 3s --health-timeout 3s --health-retries 10
    env:
      KINETIQ_DATABASE_URL: postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq
      KINETIQ_TEST_DATABASE_URL: postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq_test
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
      - run: pip install -r requirements-dev.txt
      - run: python -m ruff check .
      - run: python -m pytest -m "not mediapipe" --cov=analyzer --cov-report=term-missing
```

- [ ] **Step 10: Run**

Run: `docker compose -f backend/docker-compose.yml up -d` then `cd backend && python -m pytest tests/test_db_session.py -v`
Expected: 2 passed.

Run: `cd backend && python -m pytest -m "not mediapipe" -q`
Expected: green (analyzer suite unchanged; new DB tests pass or skip if no Postgres).

Run: `cd backend && python -m ruff check .`
Expected: `All checks passed!`

- [ ] **Step 11: Commit**

```bash
git add backend/db backend/settings.py backend/requirements.txt backend/requirements-dev.txt \
        backend/docker-compose.yml backend/tests/conftest_db.py backend/tests/conftest.py \
        backend/tests/test_db_session.py .github/workflows/ci.yml
git commit -m "feat(backend): postgres substrate — engine, get_db, docker-compose, CI service"
```

---

## Task 2: ORM models + initial migration

**Files:**
- Create: `backend/db/models.py`, `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/0001_initial.py`
- Modify: `backend/tests/conftest_db.py` (apply migrations in `pg_engine`)
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Consumes: `db.session.engine`, `settings.database_url`
- Produces:
  - `db.models.Base` (`DeclarativeBase`)
  - `db.models.User` — cols `id: UUID`, `auth0_sub: str`, `email: str|None`, `name: str|None`, `picture: str|None`, `username: str|None`, `active_sport: str|None`, `active_session_id: UUID|None`, `created_at: datetime`, `updated_at: datetime`; relationship `sports: list[UserSport]`
  - `db.models.UserSport` — cols `user_id: UUID`, `sport: str`, `added_at: datetime`; PK `(user_id, sport)`
  - `db.models.AnalysisSession` — cols `id: UUID`, `user_id: UUID`, `sport: str`, `overall_score: Decimal|None`, `source: dict`, `analysis: dict`, `created_at: datetime`
  - migration `0001_initial` creating all of it (`alembic upgrade head` works against an empty DB)

- [ ] **Step 1: Write `backend/db/models.py`**

```python
from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

_UUID_DEFAULT = text("gen_random_uuid()")
_NOW = text("now()")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
    )
    auth0_sub: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)
    picture: Mapped[str | None] = mapped_column(Text)
    username: Mapped[str | None] = mapped_column(String(20), unique=True)
    active_sport: Mapped[str | None] = mapped_column(Text)
    active_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analysis_sessions.id", ondelete="SET NULL", use_alter=True,
                   name="fk_users_active_session"),
    )
    created_at: Mapped[datetime.datetime] = mapped_column(server_default=_NOW)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        server_default=_NOW, server_onupdate=_NOW
    )

    sports: Mapped[list[UserSport]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class UserSport(Base):
    __tablename__ = "user_sports"
    __table_args__ = (UniqueConstraint("user_id", "sport", name="pk_user_sports"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    sport: Mapped[str] = mapped_column(Text, primary_key=True)
    added_at: Mapped[datetime.datetime] = mapped_column(server_default=_NOW)

    user: Mapped[User] = relationship(back_populates="sports")


class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    sport: Mapped[str] = mapped_column(Text, nullable=False)
    overall_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    source: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    analysis: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime.datetime] = mapped_column(server_default=_NOW, index=True)
```

- [ ] **Step 2: Write `backend/alembic.ini`**

```ini
[alembic]
script_location = alembic
prepend_sys_path = .

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 3: Write `backend/alembic/script.py.mako`**

Use the stock Alembic template verbatim:
```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 4: Write `backend/alembic/env.py`**

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from db.models import Base
from settings import settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url, target_metadata=target_metadata, literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.", poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 5: Write `backend/alembic/versions/0001_initial.py`**

```python
"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("auth0_sub", sa.Text(), nullable=False),
        sa.Column("email", sa.Text()),
        sa.Column("name", sa.Text()),
        sa.Column("picture", sa.Text()),
        sa.Column("username", sa.String(length=20)),
        sa.Column("active_sport", sa.Text()),
        sa.Column("active_session_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("auth0_sub", name="uq_users_auth0_sub"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )

    op.create_table(
        "analysis_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sport", sa.Text(), nullable=False),
        sa.Column("overall_score", sa.Numeric(precision=6, scale=2)),
        sa.Column("source", postgresql.JSONB(), nullable=False),
        sa.Column("analysis", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_analysis_sessions_user_id", "analysis_sessions", ["user_id"])
    op.create_index(
        "ix_sessions_user_created", "analysis_sessions",
        ["user_id", sa.text("created_at DESC")],
    )

    op.create_table(
        "user_sports",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sport", sa.Text(), primary_key=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    op.create_foreign_key(
        "fk_users_active_session", "users", "analysis_sessions",
        ["active_session_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_active_session", "users", type_="foreignkey")
    op.drop_table("user_sports")
    op.drop_index("ix_sessions_user_created", table_name="analysis_sessions")
    op.drop_index("ix_analysis_sessions_user_id", table_name="analysis_sessions")
    op.drop_table("analysis_sessions")
    op.drop_table("users")
```

- [ ] **Step 6: Apply migrations in the test engine**

`backend/tests/conftest_db.py` — in `pg_engine`, after the connectivity check and before `yield eng`, add:
```python
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", settings.test_database_url)
    command.upgrade(cfg, "head")
```
(Alembic reads `alembic.ini` relative to CWD, which is `backend/` when pytest runs.)

- [ ] **Step 7: Write `backend/tests/test_models.py`**

```python
import uuid

from db.models import AnalysisSession, User, UserSport


def test_user_round_trip(db_session):
    u = User(auth0_sub="auth0|abc", email="a@b.com", name="A")
    db_session.add(u)
    db_session.flush()
    assert isinstance(u.id, uuid.UUID)
    assert u.created_at is not None
    assert u.sports == []


def test_user_sports_and_cascade(db_session):
    u = User(auth0_sub="auth0|s")
    u.sports.append(UserSport(sport="basketball"))
    db_session.add(u)
    db_session.flush()
    assert [s.sport for s in u.sports] == ["basketball"]
    db_session.delete(u)
    db_session.flush()
    assert db_session.query(UserSport).count() == 0


def test_session_and_active_pointer(db_session):
    u = User(auth0_sub="auth0|sess")
    db_session.add(u)
    db_session.flush()
    s = AnalysisSession(
        user_id=u.id, sport="basketball", overall_score=88.5,
        source={"uri": "x"}, analysis={"overall_score": 88.5, "phases": {}},
    )
    db_session.add(s)
    db_session.flush()
    u.active_session_id = s.id
    db_session.flush()
    assert u.active_session_id == s.id
    # deleting the session nulls the pointer (SET NULL)
    db_session.delete(s)
    db_session.flush()
    db_session.refresh(u)
    assert u.active_session_id is None
```

- [ ] **Step 8: Add a migration step to CI**

`.github/workflows/ci.yml` — add a step before the pytest step:
```yaml
      - run: python -m alembic upgrade head
        env:
          KINETIQ_DATABASE_URL: postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq
```
(This proves `alembic upgrade head` runs clean against a fresh DB; the test fixture migrates `kinetiq_test` separately.)

- [ ] **Step 9: Run**

Run: `cd backend && python -m alembic upgrade head` (against local docker Postgres) — expect `Running upgrade -> 0001_initial`.
Run: `cd backend && python -m alembic downgrade base && python -m alembic upgrade head` — round-trips clean.
Run: `cd backend && python -m pytest tests/test_models.py tests/test_db_session.py -v` — all pass.
Run: `cd backend && python -m pytest -m "not mediapipe" -q` — green.
Run: `cd backend && python -m ruff check .` — clean.

- [ ] **Step 10: Commit**

```bash
git add backend/db/models.py backend/alembic.ini backend/alembic \
        backend/tests/conftest_db.py backend/tests/test_models.py .github/workflows/ci.yml
git commit -m "feat(backend): ORM models + initial Alembic migration"
```

---

## Task 3: Auth dependency

**Files:**
- Create: `backend/auth/__init__.py`, `backend/auth/dependency.py`
- Modify: `backend/tests/conftest_db.py` (add `client` + `as_user` fixtures)
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `settings.auth0_domain`, `db.session.get_db`, `db.models.User`
- Produces:
  - `auth.dependency.AUTH_CACHE_TTL: float` (`300.0`)
  - `auth.dependency._TokenCache` — `.get(token) -> dict | None`, `.put(token, claims) -> None` (thread-safe, TTL, evicts expired on access)
  - `auth.dependency.current_user` — async FastAPI dependency `(authorization: str = Header(...), db: Session = Depends(get_db)) -> User`; `401` on missing/`!Bearer`/`/userinfo` non-200 or error; upserts the `users` row from claims (`sub`, `email`, `name`, `picture`); refreshes email/name/picture when changed
  - fixtures `client` (a `TestClient` with `get_db` bound to `db_session` and `current_user` overridable) and `as_user(**overrides) -> User` (seeds + returns a `User`, installs the `current_user` override to return it)

- [ ] **Step 1: Write `backend/auth/__init__.py`** — empty file.

- [ ] **Step 2: Write `backend/tests/test_auth.py`** (fails first)

All tests here are synchronous — the async `current_user` is exercised through the
sync `TestClient`, which runs the dependency for you. No `anyio`/`pytest-asyncio`.

```python
import pytest

from auth.dependency import AUTH_CACHE_TTL, _TokenCache
from db.models import User


class _Resp:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _FakeAC:
    """Stand-in for httpx.AsyncClient; returns whatever _FakeAC.response is."""

    response = _Resp(200, {"sub": "auth0|new", "email": "e1@x.com", "name": "N", "picture": "p"})

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, *a, **k):
        return _FakeAC.response


@pytest.fixture(autouse=True)
def _fresh_auth(monkeypatch):
    monkeypatch.setattr("auth.dependency.httpx.AsyncClient", _FakeAC)
    monkeypatch.setattr("auth.dependency._CACHE", _TokenCache())
    monkeypatch.setattr("settings.settings.auth0_domain", "example.us.auth0.com")
    _FakeAC.response = _Resp(
        200, {"sub": "auth0|new", "email": "e1@x.com", "name": "N", "picture": "p"}
    )


def test_token_cache_ttl_and_eviction(monkeypatch):
    cache = _TokenCache()
    now = [1000.0]
    monkeypatch.setattr("auth.dependency.time.monotonic", lambda: now[0])
    cache.put("tok", {"sub": "auth0|1"})
    assert cache.get("tok") == {"sub": "auth0|1"}
    now[0] += AUTH_CACHE_TTL + 1
    assert cache.get("tok") is None  # expired -> evicted


def test_missing_bearer_is_401(client):
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers={"Authorization": "Token abc"}).status_code == 401


def test_userinfo_non_200_is_401(client):
    _FakeAC.response = _Resp(401, {})
    assert client.get("/me", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_creates_user_on_first_call(client, db_session):
    r = client.get("/me", headers={"Authorization": "Bearer t1"})
    assert r.status_code == 200
    assert db_session.query(User).filter_by(auth0_sub="auth0|new").count() == 1


def test_refreshes_changed_claims(client, db_session):
    client.get("/me", headers={"Authorization": "Bearer t1"})
    _FakeAC.response = _Resp(
        200, {"sub": "auth0|new", "email": "e2@x.com", "name": "N", "picture": "p"}
    )
    client.get("/me", headers={"Authorization": "Bearer t2"})  # new token -> cache miss
    u = db_session.query(User).filter_by(auth0_sub="auth0|new").one()
    assert u.email == "e2@x.com"
```

Note: every test except `test_token_cache_ttl_and_eviction` needs the `/me` route
(Task 4). In THIS task, decorate the class-free module with a top-level
`pytestmark = pytest.mark.skip(reason="needs /me route from Task 4")` **except** leave
`test_token_cache_ttl_and_eviction` runnable by moving it into its own file
`backend/tests/test_token_cache.py` (no skip). Task 4 Step 1 removes the `pytestmark`
skip from `test_auth.py`.

- [ ] **Step 3: Write `backend/auth/dependency.py`**

```python
import threading
import time

import httpx
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import User
from db.session import get_db
from settings import settings

AUTH_CACHE_TTL = 300.0


class _TokenCache:
    def __init__(self) -> None:
        self._data: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    def get(self, token: str) -> dict | None:
        with self._lock:
            entry = self._data.get(token)
            if entry is None:
                return None
            expires_at, claims = entry
            if time.monotonic() >= expires_at:
                del self._data[token]
                return None
            return claims

    def put(self, token: str, claims: dict) -> None:
        with self._lock:
            self._data[token] = (time.monotonic() + AUTH_CACHE_TTL, claims)
            # opportunistic sweep
            now = time.monotonic()
            for k in [k for k, (exp, _) in self._data.items() if exp <= now]:
                del self._data[k]


_CACHE = _TokenCache()


async def _fetch_claims(token: str) -> dict:
    cached = _CACHE.get(token)
    if cached is not None:
        return cached
    if not settings.auth0_domain:
        raise HTTPException(401, "auth is not configured")
    try:
        async with httpx.AsyncClient(timeout=8.0) as ac:
            res = await ac.get(
                f"https://{settings.auth0_domain}/userinfo",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(401, "auth check failed") from exc
    if res.status_code != 200:
        raise HTTPException(401, "invalid token")
    claims = res.json()
    _CACHE.put(token, claims)
    return claims


async def current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    # Header default=None (not `...`) so a *missing* header is 401, not 422.
    if not authorization:
        raise HTTPException(401, "missing bearer token")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "missing bearer token")

    claims = await _fetch_claims(token)
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(401, "token has no subject")

    user = db.execute(select(User).where(User.auth0_sub == sub)).scalar_one_or_none()
    if user is None:
        user = User(
            auth0_sub=sub, email=claims.get("email"),
            name=claims.get("name"), picture=claims.get("picture"),
        )
        db.add(user)
        db.flush()
    else:
        changed = False
        for field in ("email", "name", "picture"):
            new = claims.get(field)
            if new is not None and getattr(user, field) != new:
                setattr(user, field, new)
                changed = True
        if changed:
            db.flush()
    return user
```

- [ ] **Step 4: Add `client` + `as_user` fixtures to `backend/tests/conftest_db.py`**

Add `from fastapi.testclient import TestClient` to the module's imports, then:

```python
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
```

Note: `TestClient(main.app)` used as a context manager runs the startup event
(the Task 8 DB ping) — harmless against the test DB. If Task 8 isn't in yet, a
plain `TestClient(main.app)` without `with` is equivalent for now.

- [ ] **Step 5: Split the pure-cache test out**

Create `backend/tests/test_token_cache.py` with just `test_token_cache_ttl_and_eviction`
from Step 2 (imports `from auth.dependency import AUTH_CACHE_TTL, _TokenCache`). It needs
no DB, no `/me`, and runs now. Leave the rest in `test_auth.py` under the module-level
`pytestmark = pytest.mark.skip(...)` until Task 4.

- [ ] **Step 6: Run**

Run: `cd backend && python -m pytest tests/test_token_cache.py -v` — 1 passed.
Run: `cd backend && python -m pytest tests/test_auth.py -v` — all skipped (needs `/me`).
Run: `cd backend && python -m pytest -m "not mediapipe" -q` — green.
Run: `cd backend && python -m ruff check .` — clean.

- [ ] **Step 7: Commit**

```bash
git add backend/auth backend/tests/conftest_db.py backend/tests/test_auth.py \
        backend/tests/test_token_cache.py
git commit -m "feat(backend): current_user auth dependency (Auth0 /userinfo + TTL cache)"
```

---

## Task 4: Profile router

**Files:**
- Create: `backend/routers/__init__.py`, `backend/routers/profile.py`
- Modify: `backend/main.py` (include the router), `backend/tests/test_auth.py` (drop the module skip)
- Test: `backend/tests/test_profile.py`

**Interfaces:**
- Consumes: `auth.dependency.current_user`, `db.session.get_db`, `db.models.User`
- Produces: `routers.profile.router` (`APIRouter`) with:
  - `GET /me` → `{id: str, email, name, picture, username, active_sport, active_session_id}` (uuids as strings)
  - `PATCH /me/profile` body `{name?: str, username?: str}` → same shape; `400` invalid username, `409` taken
  - `GET /me/username-available?u=<name>` → `{available: bool}`
  - a reusable `_serialize_user(user: User) -> dict`

- [ ] **Step 1: Re-enable the Task 3 auth tests** — delete the module-level `pytestmark = pytest.mark.skip(...)` line from `backend/tests/test_auth.py`. Its four `/me`-dependent tests now run.

- [ ] **Step 2: Write `backend/routers/__init__.py`** — empty file.

- [ ] **Step 3: Write `backend/tests/test_profile.py`**

```python
import re

USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


def test_get_me_returns_serialized_user(client, as_user):
    u = as_user(email="p@x.com", name="Parth")
    r = client.get("/me")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(u.id)
    assert body["email"] == "p@x.com"
    assert body["username"] is None
    assert body["active_sport"] is None


def test_patch_profile_sets_name_and_username(client, as_user):
    as_user()
    r = client.patch("/me/profile", json={"name": "New", "username": "Parth_01"})
    assert r.status_code == 200
    assert r.json()["username"] == "parth_01"
    assert r.json()["name"] == "New"


def test_patch_profile_rejects_bad_username(client, as_user):
    as_user()
    r = client.patch("/me/profile", json={"username": "ab"})  # too short
    assert r.status_code == 400


def test_patch_profile_409_on_taken_username(client, as_user, db_session):
    from db.models import User

    other = User(auth0_sub="auth0|other", username="taken")
    db_session.add(other)
    db_session.flush()
    as_user()
    r = client.patch("/me/profile", json={"username": "taken"})
    assert r.status_code == 409


def test_username_available(client, as_user, db_session):
    from db.models import User

    db_session.add(User(auth0_sub="auth0|u", username="claimed"))
    db_session.flush()
    as_user()
    assert client.get("/me/username-available", params={"u": "claimed"}).json() == {
        "available": False
    }
    assert client.get("/me/username-available", params={"u": "free_name"}).json() == {
        "available": True
    }
```

- [ ] **Step 4: Write `backend/routers/profile.py`**

```python
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db

router = APIRouter()

_USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


class ProfilePatch(BaseModel):
    name: str | None = None
    username: str | None = None


def _serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "username": user.username,
        "active_sport": user.active_sport,
        "active_session_id": str(user.active_session_id) if user.active_session_id else None,
    }


@router.get("/me")
def get_me(user: User = Depends(current_user)) -> dict:
    return _serialize_user(user)


@router.patch("/me/profile")
def patch_profile(
    patch: ProfilePatch,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    if patch.name is not None:
        user.name = patch.name.strip() or None
    if patch.username is not None:
        uname = patch.username.strip().lower()
        if not _USERNAME_RE.fullmatch(uname):
            raise HTTPException(400, "username must be 3-20 chars of a-z, 0-9, underscore")
        taken = db.execute(
            select(User.id).where(User.username == uname, User.id != user.id)
        ).first()
        if taken:
            raise HTTPException(409, "username taken")
        user.username = uname
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "username taken") from exc
    return _serialize_user(user)


@router.get("/me/username-available")
def username_available(
    u: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    uname = u.strip().lower()
    if not _USERNAME_RE.fullmatch(uname):
        return {"available": False}
    exists = db.execute(select(User.id).where(User.username == uname)).first()
    return {"available": exists is None}
```

- [ ] **Step 5: Include the router in `backend/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import router as analyze_router
from routers.profile import router as profile_router
from settings import settings

app = FastAPI(title="KinetiQ Shot Analyzer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(analyze_router)
app.include_router(profile_router)
```
(Tasks 5-7 add `sports_router`, `sessions_router`, `stats_router` the same way.)

- [ ] **Step 6: Run**

Run: `cd backend && python -m pytest tests/test_profile.py tests/test_auth.py tests/test_token_cache.py -v` — all pass (the four re-enabled `test_auth.py` tests included).
Run: `cd backend && python -m pytest -m "not mediapipe" -q` — green.
Run: `cd backend && python -m ruff check .` — clean.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/__init__.py backend/routers/profile.py backend/main.py \
        backend/tests/test_profile.py backend/tests/test_auth.py
git commit -m "feat(backend): /me profile router (get, patch, username-available)"
```

---

## Task 5: Sports router

**Files:**
- Create: `backend/routers/sports.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_sports.py`

**Interfaces:**
- Consumes: `current_user`, `get_db`, `User`, `UserSport`
- Produces: `routers.sports.router` with:
  - `GET /me/sports` → `{active: str | null, selected: [str]}` (selected sorted asc)
  - `PUT /me/sports/active` body `{sport: str}` → same shape; `400` if `sport` not selected
  - `POST /me/sports/selected` body `{sport: str}` → same shape; adds; first-add also activates
  - `DELETE /me/sports/selected/{sport}` → same shape; if it was active, reassign to first remaining or `null`

- [ ] **Step 1: Write `backend/tests/test_sports.py`**

```python
def _sports(client):
    return client.get("/me/sports").json()


def test_empty_sports(client, as_user):
    as_user()
    assert _sports(client) == {"active": None, "selected": []}


def test_first_add_activates(client, as_user):
    as_user()
    r = client.post("/me/sports/selected", json={"sport": "basketball"})
    assert r.status_code == 200
    assert r.json() == {"active": "basketball", "selected": ["basketball"]}


def test_second_add_does_not_change_active_and_sorts(client, as_user):
    as_user()
    client.post("/me/sports/selected", json={"sport": "tennis"})
    body = client.post("/me/sports/selected", json={"sport": "basketball"}).json()
    assert body == {"active": "tennis", "selected": ["basketball", "tennis"]}


def test_activate_must_be_selected(client, as_user):
    as_user()
    client.post("/me/sports/selected", json={"sport": "basketball"})
    assert client.put("/me/sports/active", json={"sport": "running"}).status_code == 400
    assert client.put("/me/sports/active", json={"sport": "basketball"}).status_code == 200


def test_delete_active_reassigns(client, as_user):
    as_user()
    client.post("/me/sports/selected", json={"sport": "tennis"})
    client.post("/me/sports/selected", json={"sport": "basketball"})
    client.put("/me/sports/active", json={"sport": "tennis"})
    body = client.delete("/me/sports/selected/tennis").json()
    assert body == {"active": "basketball", "selected": ["basketball"]}
    body = client.delete("/me/sports/selected/basketball").json()
    assert body == {"active": None, "selected": []}
```

- [ ] **Step 2: Write `backend/routers/sports.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User, UserSport
from db.session import get_db

router = APIRouter()


class SportBody(BaseModel):
    sport: str


def _state(db: Session, user: User) -> dict:
    selected = db.execute(
        select(UserSport.sport).where(UserSport.user_id == user.id).order_by(UserSport.sport)
    ).scalars().all()
    return {"active": user.active_sport, "selected": list(selected)}


@router.get("/me/sports")
def get_sports(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return _state(db, user)


@router.post("/me/sports/selected")
def add_sport(
    body: SportBody, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    exists = db.execute(
        select(UserSport).where(UserSport.user_id == user.id, UserSport.sport == body.sport)
    ).scalar_one_or_none()
    if exists is None:
        db.add(UserSport(user_id=user.id, sport=body.sport))
        if user.active_sport is None:
            user.active_sport = body.sport
        db.flush()
    return _state(db, user)


@router.put("/me/sports/active")
def set_active(
    body: SportBody, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    selected = db.execute(
        select(UserSport.sport).where(UserSport.user_id == user.id)
    ).scalars().all()
    if body.sport not in selected:
        raise HTTPException(400, "sport is not in your selected list")
    user.active_sport = body.sport
    db.flush()
    return _state(db, user)


@router.delete("/me/sports/selected/{sport}")
def remove_sport(
    sport: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    db.execute(
        delete(UserSport).where(UserSport.user_id == user.id, UserSport.sport == sport)
    )
    if user.active_sport == sport:
        remaining = db.execute(
            select(UserSport.sport).where(UserSport.user_id == user.id).order_by(UserSport.sport)
        ).scalars().first()
        user.active_sport = remaining
    db.flush()
    return _state(db, user)
```

- [ ] **Step 3: Include in `backend/main.py`**

Add `from routers.sports import router as sports_router` and `app.include_router(sports_router)`.

- [ ] **Step 4: Run**

Run: `cd backend && python -m pytest tests/test_sports.py -v` — all pass.
Run: `cd backend && python -m pytest -m "not mediapipe" -q` — green.
Run: `cd backend && python -m ruff check .` — clean.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/sports.py backend/main.py backend/tests/test_sports.py
git commit -m "feat(backend): /me/sports router (active + selected set)"
```

---

## Task 6: Sessions router

**Files:**
- Create: `backend/routers/sessions.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_sessions.py`

**Interfaces:**
- Consumes: `current_user`, `get_db`, `User`, `AnalysisSession`
- Produces: `routers.sessions.router` with:
  - `POST /me/sessions` body `{sport: str, source: dict, analysis: dict}` → `{id, sport, overall_score, created_at}`; also sets `user.active_session_id`; `400` if `source`/`analysis` not objects
  - `GET /me/sessions?sport=&limit=&before=` → `[{id, sport, overall_score, created_at}]` newest-first, no blobs; `limit` default 20 max 100; `before` = ISO cursor on `created_at`
  - `GET /me/sessions/{id}` → `{id, sport, overall_score, source, analysis, created_at}`; `404` if not owned
  - `GET /me/sessions/active` → the full shape or `null`
  - `_meta(s) -> dict` and `_full(s) -> dict` serializers

- [ ] **Step 1: Write `backend/tests/test_sessions.py`**

```python
def _analysis(score=90.0):
    return {"overall_score": score, "priority": "release", "phases": {}, "pose_gif": "x" * 50}


def test_create_sets_active_and_extracts_score(client, as_user, db_session):
    u = as_user()
    r = client.post("/me/sessions", json={
        "sport": "basketball", "source": {"uri": "f.mp4"}, "analysis": _analysis(87.4),
    })
    assert r.status_code == 200
    body = r.json()
    assert body["sport"] == "basketball"
    assert float(body["overall_score"]) == 87.4
    db_session.refresh(u)
    assert str(u.active_session_id) == body["id"]


def test_list_omits_blobs_and_honours_limit(client, as_user):
    as_user()
    for i in range(3):
        client.post("/me/sessions", json={
            "sport": "basketball", "source": {}, "analysis": _analysis(float(i)),
        })
    rows = client.get("/me/sessions", params={"limit": 2}).json()
    assert len(rows) == 2
    assert set(rows[0]) == {"id", "sport", "overall_score", "created_at"}
    # newest first
    assert float(rows[0]["overall_score"]) == 2.0


def test_get_by_id_returns_blob_and_404_across_users(client, as_user, db_session):
    as_user(auth0_sub="auth0|a")
    made = client.post("/me/sessions", json={
        "sport": "basketball", "source": {"uri": "z"}, "analysis": _analysis(),
    }).json()
    full = client.get(f"/me/sessions/{made['id']}").json()
    assert full["analysis"]["pose_gif"] == "x" * 50
    assert full["source"]["uri"] == "z"

    # different user cannot see it
    as_user(auth0_sub="auth0|b")
    assert client.get(f"/me/sessions/{made['id']}").status_code == 404


def test_active_session_endpoint(client, as_user):
    as_user()
    assert client.get("/me/sessions/active").json() is None
    made = client.post("/me/sessions", json={
        "sport": "basketball", "source": {}, "analysis": _analysis(75.0),
    }).json()
    active = client.get("/me/sessions/active").json()
    assert active["id"] == made["id"]
    assert "analysis" in active


def test_create_rejects_non_object_blob(client, as_user):
    as_user()
    r = client.post("/me/sessions", json={"sport": "basketball", "source": [], "analysis": {}})
    assert r.status_code == 422 or r.status_code == 400
```

- [ ] **Step 2: Write `backend/routers/sessions.py`**

```python
import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import AnalysisSession, User
from db.session import get_db

router = APIRouter()


class SessionCreate(BaseModel):
    sport: str
    source: dict = Field(default_factory=dict)
    analysis: dict = Field(default_factory=dict)


def _meta(s: AnalysisSession) -> dict:
    return {
        "id": str(s.id),
        "sport": s.sport,
        "overall_score": float(s.overall_score) if s.overall_score is not None else None,
        "created_at": s.created_at.isoformat(),
    }


def _full(s: AnalysisSession) -> dict:
    return {**_meta(s), "source": s.source, "analysis": s.analysis}


@router.post("/me/sessions")
def create_session(
    body: SessionCreate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    raw = body.analysis.get("overall_score")
    score = float(raw) if isinstance(raw, int | float) else None
    s = AnalysisSession(
        user_id=user.id, sport=body.sport, overall_score=score,
        source=body.source, analysis=body.analysis,
    )
    db.add(s)
    db.flush()
    user.active_session_id = s.id
    db.flush()
    return _meta(s)


@router.get("/me/sessions")
def list_sessions(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    sport: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    before: dt.datetime | None = None,
) -> list[dict]:
    q = select(AnalysisSession).where(AnalysisSession.user_id == user.id)
    if sport:
        q = q.where(AnalysisSession.sport == sport)
    if before:
        q = q.where(AnalysisSession.created_at < before)
    q = q.order_by(AnalysisSession.created_at.desc()).limit(limit)
    return [_meta(s) for s in db.execute(q).scalars().all()]


@router.get("/me/sessions/active")
def active_session(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict | None:
    if user.active_session_id is None:
        return None
    s = db.get(AnalysisSession, user.active_session_id)
    return _full(s) if s and s.user_id == user.id else None


@router.get("/me/sessions/{session_id}")
def get_session(
    session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    s = db.get(AnalysisSession, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "session not found")
    return _full(s)
```

Note: declare `/me/sessions/active` **before** `/me/sessions/{session_id}` so "active" is not parsed as a uuid path param. FastAPI matches in declaration order.

- [ ] **Step 3: Include in `backend/main.py`** — `from routers.sessions import router as sessions_router`; `app.include_router(sessions_router)`.

- [ ] **Step 4: Run**

Run: `cd backend && python -m pytest tests/test_sessions.py -v` — all pass.
Run: `cd backend && python -m pytest -m "not mediapipe" -q` — green.
Run: `cd backend && python -m ruff check .` — clean.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/sessions.py backend/main.py backend/tests/test_sessions.py
git commit -m "feat(backend): /me/sessions router (create, list, get, active)"
```

---

## Task 7: Stats router

**Files:**
- Create: `backend/routers/stats.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_stats.py`

**Interfaces:**
- Consumes: `current_user`, `get_db`, `AnalysisSession`
- Produces: `routers.stats.router` with `GET /me/stats?sport=` → `{videosUploaded, shotsAnalyzed, totalScore, avgScore, bestScore, latestScore, exp, level, progressPct, currentLevelExp, nextLevelExp}` (all numbers; zeros when no rows). Ports `VIDEO_EXP_REWARD = 50`, `BASE_LEVEL_EXP = 50`, `get_total_exp_required_for_level`, `calculate_level_progress` verbatim (behaviour) from `frontend/services/user-stats.ts`.

- [ ] **Step 1: Write `backend/tests/test_stats.py`**

```python
import pytest

from routers.stats import calculate_level_progress, get_total_exp_required_for_level


@pytest.mark.parametrize(
    "level,total",
    [(0, 0), (1, 50), (2, 150), (3, 300), (4, 500)],
)
def test_total_exp_curve(level, total):
    assert get_total_exp_required_for_level(level) == total


@pytest.mark.parametrize(
    "exp,level,pct",
    [(0, 0, 0), (50, 1, 0), (100, 1, 50), (149, 1, 99), (150, 2, 0)],
)
def test_level_progress_table(exp, level, pct):
    p = calculate_level_progress(exp)
    assert p["level"] == level
    assert p["progressPct"] == pct


def test_stats_zero_when_no_sessions(client, as_user):
    as_user()
    s = client.get("/me/stats").json()
    assert s["shotsAnalyzed"] == 0
    assert s["avgScore"] == 0
    assert s["bestScore"] == 0
    assert s["level"] == 0


def test_stats_aggregate(client, as_user):
    as_user()
    for score in (60.0, 90.0, 30.0):
        client.post("/me/sessions", json={
            "sport": "basketball", "source": {},
            "analysis": {"overall_score": score, "phases": {}},
        })
    s = client.get("/me/stats").json()
    assert s["shotsAnalyzed"] == 3
    assert s["videosUploaded"] == 3
    assert s["totalScore"] == 180
    assert s["avgScore"] == 60.0
    assert s["bestScore"] == 90
    assert s["latestScore"] == 30
    assert s["exp"] == 150
    assert s["level"] == 2


def test_stats_filtered_by_sport(client, as_user):
    as_user()
    client.post("/me/sessions", json={"sport": "basketball", "source": {},
                                      "analysis": {"overall_score": 80.0, "phases": {}}})
    client.post("/me/sessions", json={"sport": "tennis", "source": {},
                                      "analysis": {"overall_score": 20.0, "phases": {}}})
    assert client.get("/me/stats", params={"sport": "basketball"}).json()["shotsAnalyzed"] == 1
```

- [ ] **Step 2: Write `backend/routers/stats.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import AnalysisSession, User
from db.session import get_db

router = APIRouter()

VIDEO_EXP_REWARD = 50
BASE_LEVEL_EXP = 50


def get_total_exp_required_for_level(level: int) -> int:
    if level <= 0:
        return 0
    return BASE_LEVEL_EXP * level * (level + 1) // 2


def calculate_level_progress(exp: int) -> dict:
    level = 0
    while exp >= get_total_exp_required_for_level(level + 1):
        level += 1
    current = get_total_exp_required_for_level(level)
    nxt = get_total_exp_required_for_level(level + 1)
    into = max(0, exp - current)
    span = max(1, nxt - current)
    return {
        "level": level,
        "progressPct": min(100, round((into / span) * 100)),
        "currentLevelExp": current,
        "nextLevelExp": nxt,
    }


@router.get("/me/stats")
def get_stats(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    sport: str | None = None,
) -> dict:
    q = select(
        func.count(AnalysisSession.id),
        func.coalesce(func.sum(AnalysisSession.overall_score), 0),
        func.coalesce(func.avg(AnalysisSession.overall_score), 0),
        func.coalesce(func.max(AnalysisSession.overall_score), 0),
    ).where(AnalysisSession.user_id == user.id)
    if sport:
        q = q.where(AnalysisSession.sport == sport)
    count, total, avg, best = db.execute(q).one()

    latest_q = select(AnalysisSession.overall_score).where(
        AnalysisSession.user_id == user.id
    )
    if sport:
        latest_q = latest_q.where(AnalysisSession.sport == sport)
    latest = db.execute(
        latest_q.order_by(AnalysisSession.created_at.desc()).limit(1)
    ).scalar()

    videos = int(count)
    exp = videos * VIDEO_EXP_REWARD
    progress = calculate_level_progress(exp)
    return {
        "videosUploaded": videos,
        "shotsAnalyzed": videos,
        "totalScore": round(float(total)),
        "avgScore": round(float(avg), 1) if count else 0,
        "bestScore": round(float(best)) if count else 0,
        "latestScore": round(float(latest)) if latest is not None else 0,
        "exp": exp,
        **progress,
    }
```

- [ ] **Step 3: Include in `backend/main.py`** — `from routers.stats import router as stats_router`; `app.include_router(stats_router)`.

- [ ] **Step 4: Run**

Run: `cd backend && python -m pytest tests/test_stats.py -v` — all pass.
Run: `cd backend && python -m pytest -m "not mediapipe" -q` — green.
Run: `cd backend && python -m ruff check .` — clean.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/stats.py backend/main.py backend/tests/test_stats.py
git commit -m "feat(backend): /me/stats derived from analysis_sessions"
```

---

## Task 8: Backend wrap-up — startup ping, layering guard, deploy artifacts, docs

**Files:**
- Modify: `backend/main.py` (startup DB ping)
- Create: `backend/render.yaml`, `backend/tests/test_layering.py`
- Modify: `backend/CHANGES.md`, `backend/README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-7
- Produces: a `render.yaml`, a layering test, docs. No new API surface.

- [ ] **Step 1: Write `backend/tests/test_layering.py`**

```python
import ast
from pathlib import Path

ANALYZER = Path(__file__).resolve().parents[1] / "analyzer"
FORBIDDEN = {"db", "auth", "routers"}


def _first_parties(pyfile: Path) -> set[str]:
    tree = ast.parse(pyfile.read_text())
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            out.add(node.module.split(".")[0])
    return out


def test_analyzer_does_not_import_persistence():
    offenders = {}
    for py in ANALYZER.rglob("*.py"):
        bad = _first_parties(py) & FORBIDDEN
        if bad:
            offenders[str(py.relative_to(ANALYZER.parent))] = bad
    assert not offenders, offenders
```

- [ ] **Step 2: Add the startup DB ping to `backend/main.py`**

Append:
```python
import logging

from sqlalchemy import text

from db.session import engine

logger = logging.getLogger(__name__)


@app.on_event("startup")
def _db_ping() -> None:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("database reachable")
    except Exception:  # noqa: BLE001
        logger.exception("database unreachable at startup — /me/* routes will 503")
```

(Keep it a log-and-continue: `/health` and `/analyze` must still work with no DB. FastAPI's `on_event` is deprecated but still supported in the pinned version; a `lifespan` handler is an acceptable equivalent if the implementer prefers — either way, do not raise.)

- [ ] **Step 3: Write `backend/render.yaml`**

```yaml
services:
  - type: web
    name: kinetiq-api
    runtime: python
    rootDir: backend
    plan: free
    buildCommand: pip install -r requirements.txt
    preDeployCommand: python -m alembic upgrade head
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: KINETIQ_DATABASE_URL
        sync: false
      - key: KINETIQ_AUTH0_DOMAIN
        sync: false
      - key: KINETIQ_CORS_ORIGINS
        sync: false
```

- [ ] **Step 4: Update `backend/CHANGES.md`**

Append:
```markdown
## 7. Persistence layer (B1)

A Postgres persistence layer now sits behind the API for user profile,
sports selection, and analysis sessions. New packages `backend/db/`,
`backend/auth/`, `backend/routers/` (independent of `analyzer/` — enforced
by `tests/test_layering.py`).

- Auth: every `/me/*` request needs `Authorization: Bearer <Auth0 access
  token>`. The backend validates it against `https://<AUTH0_DOMAIN>/userinfo`
  with a 5-minute in-process cache and upserts a `users` row. Single
  process only — a cold start re-hits `/userinfo` once per token.
- Endpoints: `GET/PATCH /me`, `GET /me/username-available`,
  `GET/PUT/POST/DELETE /me/sports*`, `POST/GET /me/sessions*`,
  `GET /me/stats`. Stats are derived from `analysis_sessions`, never
  stored.
- Config: `KINETIQ_DATABASE_URL`, `KINETIQ_AUTH0_DOMAIN`,
  `KINETIQ_TEST_DATABASE_URL` (tests). Migrations: `alembic upgrade head`.
- Local: `docker compose -f backend/docker-compose.yml up -d`.
- Deploy: `render.yaml` (Render free web service) + Neon free Postgres.
```

- [ ] **Step 5: Update `backend/README.md`**

Add a "Database" subsection near the run instructions:
```markdown
### Database (B1+)

```bash
docker compose -f backend/docker-compose.yml up -d      # local Postgres
cd backend
export KINETIQ_DATABASE_URL=postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq
export KINETIQ_AUTH0_DOMAIN=<your-tenant>.us.auth0.com
python -m alembic upgrade head
uvicorn main:app --reload --port 8000
```

`/me/*` endpoints require `Authorization: Bearer <Auth0 access token>`.
```

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && python -m pytest -m "not mediapipe" -v` — every test passes (analyzer + all new DB/auth/router tests).
Run: `cd backend && python -m ruff check .` — `All checks passed!`
Run: `cd backend && python -c "import main; print(sorted(r.path for r in main.app.routes))"` — includes `/analyze`, `/health`, `/sports`, `/me`, `/me/profile`, `/me/username-available`, `/me/sports`, `/me/sports/active`, `/me/sports/selected`, `/me/sports/selected/{sport}`, `/me/sessions`, `/me/sessions/active`, `/me/sessions/{session_id}`, `/me/stats`.
Run (CI-equivalent): `cd backend && KINETIQ_TEST_DATABASE_URL=postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq_test python -m pytest -m "not mediapipe" --cov=analyzer --cov-report=term-missing`.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/render.yaml backend/tests/test_layering.py \
        backend/CHANGES.md backend/README.md
git commit -m "chore(backend): startup db ping, layering guard, render.yaml, docs"
```

---

## Task 9: Frontend API client + hooks

**Files:**
- Create: `frontend/config/api.ts`, `frontend/hooks/use-api.ts`
- Modify: `frontend/context/auth-context.tsx`

**Interfaces:**
- Produces:
  - `config/api.ts`: `class ApiError extends Error { status: number; detail: string }`; `registerTokenAccessor(fn: () => string | null): void`; `apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>` — prefixes `requireRuntimeConfig("kinetiqApiUrl")`, adds `Authorization: Bearer <token>` when a token is available, JSON-encodes `body`, throws `ApiError` on non-2xx (parsing `{detail}` when present), returns parsed JSON (or `undefined` for 204).
  - `hooks/use-api.ts`:
    - `useApiQuery<T>(key: string | null, path: string | null): { value: T | null; isLoading: boolean; error: Error | null; refetch: () => void }`
    - `useApiMutation<TResult = unknown>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE"): { mutate: (body?: unknown) => Promise<TResult>; isLoading: boolean; error: Error | null }`
    - `invalidate(keyPrefix: string): void`
- Consumes: `config/runtime.ts` `requireRuntimeConfig("kinetiqApiUrl")` (already present)

- [ ] **Step 1: Write `frontend/config/api.ts`**

```typescript
import { requireRuntimeConfig } from "@/config/runtime";

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

let tokenAccessor: (() => string | null) | null = null;

export function registerTokenAccessor(fn: () => string | null): void {
  tokenAccessor = fn;
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const base = requireRuntimeConfig(
    "kinetiqApiUrl",
    "Missing EXPO_PUBLIC_KINETIQ_API_URL. Point it at the KinetiQ backend.",
  );
  const token = tokenAccessor?.() ?? null;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let bodyInit: string | undefined;
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(init.body);
  }

  const res = await fetch(`${base}${path}`, {
    method: init?.method ?? "GET",
    headers,
    body: bodyInit,
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : res.statusText;
    throw new ApiError(res.status, detail);
  }
  return parsed as T;
}
```

- [ ] **Step 2: Write `frontend/hooks/use-api.ts`**

```typescript
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/config/api";

type CacheEntry = { value: unknown; at: number };
const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();

export function invalidate(keyPrefix: string): void {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(keyPrefix)) cache.delete(k);
  }
  for (const [k, set] of listeners) {
    if (k.startsWith(keyPrefix)) set.forEach((fn) => fn());
  }
}

function subscribe(key: string, fn: () => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => listeners.get(key)?.delete(fn);
}

export function useApiQuery<T>(key: string | null, path: string | null) {
  const [value, setValue] = useState<T | null>(
    key && cache.has(key) ? (cache.get(key)!.value as T) : null,
  );
  const [isLoading, setIsLoading] = useState(!!path);
  const [error, setError] = useState<Error | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const run = useCallback(() => {
    const p = pathRef.current;
    if (!key || !p) {
      setValue(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    apiFetch<T>(p)
      .then((v) => {
        cache.set(key, { value: v, at: Date.now() });
        setValue(v);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setIsLoading(false));
  }, [key]);

  useEffect(() => {
    run();
    if (!key) return;
    return subscribe(key, run);
  }, [key, run]);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  return { value, isLoading, error, refetch: run };
}

export function useApiMutation<TResult = unknown>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (body?: unknown): Promise<TResult> => {
      setIsLoading(true);
      setError(null);
      try {
        return await apiFetch<TResult>(path, { method, body });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [path, method],
  );

  return { mutate, isLoading, error };
}
```

- [ ] **Step 3: Wire the token accessor in `frontend/context/auth-context.tsx`**

- Add `accessToken` to state: `const [accessToken, setAccessToken] = useState<string | null>(null);`
- In `storeUser(userData, accessToken?)` — also `if (accessToken) setAccessToken(accessToken);`
- On web boot, after `validateToken` succeeds, `setAccessToken(token)`.
- On `logout`, `setAccessToken(null)`.
- Near the top of `AuthProvider`, register the accessor once:
  ```typescript
  import { registerTokenAccessor } from "@/config/api";
  // inside the component:
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = accessToken;
  useEffect(() => {
    registerTokenAccessor(() => tokenRef.current);
  }, []);
  ```
- Do **not** change the PKCE flow, discovery, `exchangeCodeAsync`, or callback handling.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit` — clean.
Run: `cd frontend && npx expo lint` — clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/config/api.ts frontend/hooks/use-api.ts frontend/context/auth-context.tsx
git commit -m "feat(frontend): api client + useApiQuery/useApiMutation hooks"
```

---

## Task 10: Frontend cutover

**Files:**
- Modify: `frontend/config/firebase.ts`, `frontend/config/runtime.ts`, `frontend/services/user-profile.ts`, `frontend/app/sports.tsx`, `frontend/app/(tabs)/index.tsx`, `frontend/app/(tabs)/upload.tsx`, `frontend/app/shot-breakdown.tsx`, `frontend/app/phase-detail.tsx`, `frontend/app/player-stats.tsx`, `frontend/hooks/use-user-profile.ts`, `frontend/hooks/use-user-stats.ts`, `frontend/app/(tabs)/leaderboard.tsx`, `frontend/app/friends/add.tsx`, `frontend/hooks/use-social-inbox.ts`, `frontend/hooks/use-profile-customization.ts`, `frontend/package.json`
- Delete: `frontend/hooks/use-database.ts`, `frontend/services/user-stats.ts`, `frontend/services/analysis-sessions.ts`

**Interfaces:**
- Consumes: `config/api.ts`, `hooks/use-api.ts` (Task 9); backend endpoints (Tasks 4-7).
- Produces: an app with zero live `firebase/database` calls; B2 features on a stub.

- [ ] **Step 1: Replace `frontend/config/firebase.ts` with a stub**

```typescript
/**
 * B1 removed Firebase. Leaderboard, friends, social inbox and profile
 * cosmetics return in sub-project B2. Until then any access throws.
 */
const message = "persistence for this feature returns in B2";

export const db = new Proxy(
  {},
  {
    get() {
      throw new Error(message);
    },
  },
) as unknown as never;
```

- [ ] **Step 2: Prune `frontend/config/runtime.ts`**

Delete the seven `firebase*` keys from `runtimeConfig` (keep `auth0Domain`, `auth0ClientId`, `kinetiqApiUrl`). Update the `keyof typeof runtimeConfig` union consumers compile.

- [ ] **Step 3: Strip `frontend/services/user-profile.ts`**

Keep: the `AppUserProfile` interface, `USERNAME_MIN_LENGTH`, `USERNAME_MAX_LENGTH`, `normalizeUsernameInput`, `isValidUsername`, `getUsernameValidationMessage`. Delete: the `firebase/database` and `@/config/firebase` imports, `getUserProfilePath`, `claimUsername`. Change `USERNAME_PATTERN` to `/^[a-z0-9_]+$/` (drop the period — the backend rejects it) and have `normalizeUsernameInput` strip periods too (`.replace(/[^a-z0-9_]/g, "")`).

- [ ] **Step 4: Rewire `frontend/hooks/use-user-profile.ts`**

```typescript
import { useApiQuery } from "@/hooks/use-api";
import type { AppUserProfile } from "@/services/user-profile";

type MeResponse = {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  username: string | null;
  active_sport: string | null;
  active_session_id: string | null;
};

export function useUserProfile(userSub: string | null | undefined) {
  const key = userSub ? "me" : null;
  const { value, isLoading, error } = useApiQuery<MeResponse>(key, key ? "/me" : null);
  const profile: AppUserProfile | null = value
    ? {
        username: value.username ?? "",
        displayName: value.name ?? value.username ?? "",
        email: value.email,
        createdAt: "",
        updatedAt: "",
      }
    : null;
  return { profile, isLoading, error, hasUsername: Boolean(value?.username) };
}
```

- [ ] **Step 5: Rewire `frontend/hooks/use-user-stats.ts`**

```typescript
import { useApiQuery } from "@/hooks/use-api";
import type { AppUserStats } from "@/services/user-stats";
```
`services/user-stats.ts` is deleted in Step 12 — instead inline the type here:
```typescript
export type AppUserStats = {
  videosUploaded: number;
  shotsAnalyzed: number;
  totalScore: number;
  avgScore: number;
  bestScore: number;
  latestScore: number;
  exp: number;
  level: number;
  progressPct: number;
  currentLevelExp: number;
  nextLevelExp: number;
};

import { useApiQuery } from "@/hooks/use-api";

export function useUserStats(userSub: string | null | undefined) {
  const key = userSub ? "stats" : null;
  const { value, isLoading, error } = useApiQuery<AppUserStats>(key, key ? "/me/stats" : null);
  return { stats: value, isLoading, error };
}
```
Update any importer of `AppUserStats` from `@/services/user-stats` to `@/hooks/use-user-stats`.

- [ ] **Step 6: Rewire `frontend/app/sports.tsx`**

Replace the two `useDatabaseLiveValue` calls and the three `set(ref(db, ...))` calls:
```typescript
import { useApiQuery, useApiMutation, invalidate } from "@/hooks/use-api";

type SportsState = { active: string | null; selected: string[] };

const { value: sportsState } = useApiQuery<SportsState>("sports", "/me/sports");
const activeSport = sportsState?.active ?? null;
const selectedSports = new Set(sportsState?.selected ?? []);

const addSport = useApiMutation<SportsState>("/me/sports/selected", "POST");
const setActive = useApiMutation<SportsState>("/me/sports/active", "PUT");

async function handleSportPress(sport: { name: string; emoji: string }) {
  const s = sport.name.toLowerCase();
  if (selectedSports.has(sport.name) || selectedSports.has(s)) {
    await setActive.mutate({ sport: s });
  } else {
    setConfirmSport(sport);
  }
  invalidate("sports");
}

async function handleAddSport() {
  if (!confirmSport) return;
  await addSport.mutate({ sport: confirmSport.name.toLowerCase() });
  invalidate("sports");
  setConfirmSport(null);
}
```
The `SPORTS` list display uses lowercase comparison for `isSelected` / `isActive` (`activeSport === sport.name.toLowerCase()`). Remove the `firebase/database`, `@/config/firebase`, and `useDatabaseLiveValue` imports and the `sanitizeUid` helper. Keep all styling and the modal.

- [ ] **Step 7: Rewire `frontend/app/(tabs)/index.tsx`**

Replace `useDatabaseLiveValue<string>(\`users/${userId}/sports/active\`)` with:
```typescript
import { useApiQuery } from "@/hooks/use-api";
const { value: sportsState } = useApiQuery<{ active: string | null }>("sports", "/me/sports");
const activeSport = sportsState?.active ?? null;
```
Remove the `useDatabaseLiveValue` import and the `formatUserId`/`userId` line if now unused. `useProfileCustomization` stays (Step 13 makes it a safe no-op).

- [ ] **Step 8: Rewire `frontend/app/(tabs)/upload.tsx`**

- Active sport: replace the `useDatabaseLiveValue<string>` at line ~269 with the `useApiQuery<{active}>("sports", "/me/sports")` pattern from Step 7; `const sport = activeSport ?? "basketball";`.
- Session save: replace `saveAnalysisSession(...)` (line ~104) with a direct API call. After `const analysis = await analyzeVideo(asset);`:
  ```typescript
  import { apiFetch } from "@/config/api";
  import { invalidate } from "@/hooks/use-api";
  // ...
  const created = await apiFetch<{ id: string }>("/me/sessions", {
    method: "POST",
    body: {
      sport: (activeSport ?? "basketball"),
      source: {
        uri: asset.uri,
        fileName: asset.fileName ?? null,
        mimeType: asset.mimeType ?? null,
        fileSize: asset.fileSize ?? null,
        durationMs: asset.duration ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
      },
      analysis,
    },
  });
  invalidate("stats");
  invalidate("sessions");
  // navigate using created.id
  ```
- Replace the `useDatabaseLiveValue<string>` for `latestSessionId` (line ~76) with local state set to `created.id` after the POST (the "view breakdown" button reads that state).
- Remove the `saveAnalysisSession` import and the `useDatabaseLiveValue` import.

- [ ] **Step 9: Rewire `frontend/app/shot-breakdown.tsx`**

```typescript
import { useApiQuery } from "@/hooks/use-api";
import type { AnalysisSession } from "@/types/analysis";

const requestedSessionId = typeof params.sessionId === "string" ? params.sessionId : null;
const key = requestedSessionId ? `session:${requestedSessionId}` : "session:active";
const path = requestedSessionId ? `/me/sessions/${requestedSessionId}` : "/me/sessions/active";
const { value: session, isLoading } = useApiQuery<AnalysisSession | null>(key, path);
```
The backend `_full` shape (`{id, sport, overall_score, source, analysis, created_at}`) is assignment-compatible with the parts of `AnalysisSession` this screen reads (`session.analysis...`). Add `createdAt`/`updatedAt` as optional in the local read or map `created_at` → `createdAt` if the screen uses it. Remove `formatUserId`, `useAuth` userId usage for the DB path, and the `useDatabaseLiveValue` import.

- [ ] **Step 10: Rewire `frontend/app/phase-detail.tsx`**

```typescript
import { useApiQuery } from "@/hooks/use-api";
const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
const { value: session } = useApiQuery<AnalysisSession | null>(
  sessionId ? `session:${sessionId}` : null,
  sessionId ? `/me/sessions/${sessionId}` : null,
);
```
Remove the `useDatabaseLiveValue` and `formatUserId` usage for the path.

- [ ] **Step 11: Rewire `frontend/app/player-stats.tsx`**

Replace the `useDatabaseLiveValue<Record<string, AnalysisSession>>(\`users/${userId}/analysisSessions\`)` with:
```typescript
import { useApiQuery } from "@/hooks/use-api";

type SessionMeta = { id: string; sport: string; overall_score: number | null; created_at: string };
const { value: sessions } = useApiQuery<SessionMeta[]>("sessions", "/me/sessions?limit=4");
const recentSessions = (sessions ?? []).map((s) => ({
  // adapt to the existing card props; use s.overall_score and s.created_at
}));
```
The screen currently reads `session.analysis.overall_score` and `session.createdAt` from the full blob for the recent cards — switch those to `s.overall_score` and `s.created_at`. If a card needs a per-phase number it must navigate to the breakdown (already the pattern). Remove `useDatabaseLiveValue`, the `sessionMap` sort/slice (server already sorts + limits), and `formatUserId` if unused.

- [ ] **Step 12: Delete the dead service/hook files**

```bash
git rm frontend/hooks/use-database.ts frontend/services/user-stats.ts \
       frontend/services/analysis-sessions.ts
```
Fix any remaining import of these (there should be none after Steps 4-11 except `analysis-sessions`'s B2 side-effect imports, which die with it).

- [ ] **Step 13: Neutralise the B2-only screens/hooks**

- `frontend/hooks/use-social-inbox.ts` — at the top of the exported hook, short-circuit: return a stable disabled state (`{ inbox: null, isLoading: false, error: null, ...whatever the callers destructure... }`) and never touch `useDatabaseLiveValue`/`useDatabaseWrite`. Remove the `@/hooks/use-database` import.
- `frontend/hooks/use-profile-customization.ts` — same: return the default customization object (whatever `(tabs)/index.tsx` and `profile-cosmetics` expect) with no-op setters; drop the `use-database` import.
- `frontend/app/(tabs)/leaderboard.tsx` — replace the body with a centered "Leaderboards are coming back soon" view; remove `useDatabaseLiveValue` and `@/services/leaderboard` imports. Keep the file/route.
- `frontend/app/friends/add.tsx` — same "coming back soon" treatment; remove the `useDatabaseLiveValue('users')` call.
- `frontend/services/leaderboard.ts` and `frontend/services/profile-customization.ts` — leave the files (they import `@/config/firebase`, which is now the throwing stub); nothing calls them after the above. If `tsc` complains about unused/あるいは the stub type, add `// @ts-nocheck` at the top of each with a comment pointing to B2, or delete them and re-add in B2 — implementer's call, note which.

- [ ] **Step 14: Remove the `firebase` dependency**

`frontend/package.json` — delete `"firebase": "^12.12.0"` from `dependencies`. Run `cd frontend && npm install` to update the lockfile.

- [ ] **Step 15: Verify**

Run: `cd frontend && npx tsc --noEmit` — clean.
Run: `cd frontend && npx expo lint` — clean.
Run: `cd frontend && grep -rn "firebase/database\|from \"firebase\|from 'firebase" --include=*.ts --include=*.tsx . | grep -v node_modules` — **no matches** (the stub `config/firebase.ts` imports nothing from `firebase`).
Run: `cd frontend && grep -rn "use-database\|useDatabaseLiveValue\|useDatabaseValue\|useDatabaseWrite" --include=*.ts --include=*.tsx . | grep -v node_modules` — **no matches**.

- [ ] **Step 16: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): cut the data layer over from firebase/database to the KinetiQ API"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| Postgres schema + Alembic (users, user_sports, analysis_sessions) | 2 |
| Engine / `get_db` / docker-compose | 1 |
| Auth: Bearer Auth0 token → `/userinfo` → `users` row, 5-min cache | 3 |
| `GET /me`, `PATCH /me/profile`, `GET /me/username-available` | 4 |
| `GET/PUT/POST/DELETE /me/sports*` incl. first-add-activates, delete-active-reassigns | 5 |
| `POST /me/sessions` (+ active pointer, score promotion), list (no blob, limit/before), `GET {id}` (404 cross-user), `GET active` | 6 |
| `GET /me/stats` derived + ported level/exp formula | 7 |
| Startup DB ping (log-and-continue), 503 posture | 8 |
| Layering guard (`analyzer/**` imports no persistence) | 8 |
| `render.yaml`, Neon + Render, docker-compose local | 1, 8 |
| CI Postgres service + migration | 1, 2 |
| Frontend `config/api.ts` + token accessor | 9 |
| Frontend `use-api.ts` (`useApiQuery`/`useApiMutation`/`invalidate`, focus refetch) | 9 |
| Rewire the 8 screens/hooks | 10 |
| B2-feature stub + "coming back soon" | 10 |
| Remove `firebase` dep, delete dead files | 10 |
| No data migration | (n/a — nothing to do) |
| No frontend test runner added | plan decision, stated in Global Constraints |

**2. Placeholder scan.** Task 3's `test_auth.py` has a helper (`_expect_401`) written awkwardly — the implementer is told to use `pytest.raises(HTTPException)` semantics; acceptable as a concrete pattern, not a placeholder. Task 10 Step 13's last bullet leaves a genuine either/or (`@ts-nocheck` vs delete the two B2 service files) with both paths spelled out and a "note which" instruction — this is a real judgment call the implementer records, not an unresolved gap. No `TODO`/`TBD`/"handle errors" left.

**3. Type consistency.**
- `current_user -> User` — same in Tasks 3, 4, 5, 6, 7.
- `get_db -> Iterator[Session]` — same everywhere; overridden by `db_session` in tests (Task 1/3).
- `_serialize_user` shape (`id, email, name, picture, username, active_sport, active_session_id`) — produced in Task 4, consumed by frontend Task 10 Step 4 (`MeResponse`). Matches.
- sports state `{active: str|null, selected: [str]}` — Task 5 produces, Task 10 Steps 6/7/8 consume. Matches.
- session meta `{id, sport, overall_score, created_at}` vs full `{... , source, analysis}` — Task 6 produces both, Task 10 Steps 9/11 consume. Matches.
- stats keys — Task 7 produces exactly the 11 keys the frontend `AppUserStats` (Task 10 Step 5) lists. Matches.
- `apiFetch<T>` / `useApiQuery(key, path)` / `useApiMutation(path, method)` / `invalidate(prefix)` — defined in Task 9, used with those signatures throughout Task 10.

**Ordering safety.** Backend Tasks 1→8 each leave the suite green (new tests pass or skip without Postgres; analyzer tests never touched). Task 3's one router-dependent test is skipped until Task 4 unskips it. Frontend Task 9 is additive (new files + an accessor registration); Task 10 is the cutover and is the first point where `firebase/database` calls disappear — it is one commit so the app never sits half-migrated in history. `main.py` grows one `include_router` per backend router task; `test_layering.py` (Task 8) guards the one-way `analyzer` ↛ persistence rule from then on.
