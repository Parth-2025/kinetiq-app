# Rim Ready Workspace

This repo is now split into two top-level apps so it is easier to work in each side independently.

## Layout

- `frontend/`: Expo app
- `backend/`: FastAPI + MediaPipe shot analysis service

## Frontend

```bash
cd frontend
npm install
npx expo start
```

Frontend runtime config lives in `frontend/.env`.

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The frontend is already set up to use:

```bash
EXPO_PUBLIC_KINETIQ_API_URL=http://172.20.10.13:8000
```
