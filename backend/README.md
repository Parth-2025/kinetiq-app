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
