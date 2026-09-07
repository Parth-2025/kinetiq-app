# KinetiQ Backend

This folder vendors the FastAPI basketball form analyzer from the KinetiQ `development` branch so the frontend can target a local backend that lives in the same workspace.

## Backend

Requires Python 3.11 or 3.12 (MediaPipe has no 3.13 wheels).

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt      # runtime + test deps
uvicorn main:app --reload --port 8000
```

`POST /analyze` is multipart: `video=<file>` and `sport=basketball`
(list options at `GET /sports`).

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

| var | purpose |
|---|---|
| `KINETIQ_DATABASE_URL` | Postgres DSN (`postgresql+psycopg://…`) |
| `KINETIQ_AUTH0_DOMAIN` | Auth0 tenant domain for `/userinfo` token validation. **If unset, every `/me/*` request 401s.** |
| `KINETIQ_TEST_DATABASE_URL` | test DB DSN (tests only) |
| `KINETIQ_CORS_ORIGINS` | JSON list of allowed origins |

### Configuration (env, prefix `KINETIQ_`)

| Var | Default | Meaning |
|---|---|---|
| `KINETIQ_MODEL_CACHE_DIR` | `~/.cache/kinetiq` | Where the MediaPipe pose model is downloaded once. |
| `KINETIQ_CORS_ORIGINS` | `["*"]` | JSON list of allowed origins. |

### Tests

```bash
cd backend
python -m pytest -m "not mediapipe"      # no video / MediaPipe needed
python -m pytest -m mediapipe            # needs mediapipe + tests/fixtures/sample_shot.mp4
```
