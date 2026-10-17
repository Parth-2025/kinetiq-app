# KinetiQ Backend

## Performance Studio

The new athlete/coach workspace uses authenticated `/studio` routes and a separate analysis worker. See [Studio setup and implementation status](studio/README.md) before starting it. Apply migration `0002_studio`; existing legacy analysis records remain separate.

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

### Saved display rigs

Migration `0009_display_rig_revisions` adds private saved mannequin artifacts. Run
`alembic upgrade head` with your development database configured before using the
new routes. Session owners can POST `/studio/sessions/{id}/rig-revisions`; current
authorized readers can list revisions and GET a revision by ID. Session deletion
removes its revisions; data export includes only currently accessible revisions.
Display fitting does not modify recorded analysis. See
[`../skinner_implementation_checklist.md`](../skinner_implementation_checklist.md)
for the implementation and pending verification checkpoint.

### Running tests

For the experimental ball pipeline, model setup, migration 0010 and reviewed-shot endpoints, see [basketball runtime](../docs/design/basketball-runtime-v1.md). The worker needs an explicit `.venv/bin/python -m studio.download_ball_model` from this folder. Existing sessions need a new upload to obtain ball evidence after source cleanup.

```bash
cd backend
python -m pytest -m "not mediapipe"      # no video / MediaPipe needed
python -m pytest -m mediapipe            # needs mediapipe + tests/fixtures/sample_shot.mp4
```
