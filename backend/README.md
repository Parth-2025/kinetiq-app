# KinetiQ Backend

This folder vendors the FastAPI basketball form analyzer from the KinetiQ `development` branch so the frontend can target a local backend that lives in the same workspace.

## Run locally

```bash
cd kinetiq-backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Set `EXPO_PUBLIC_KINETIQ_API_URL` in the frontend `.env` file to the backend base URL you are using, for example:

```bash
EXPO_PUBLIC_KINETIQ_API_URL=http://192.168.1.25:8000
```
