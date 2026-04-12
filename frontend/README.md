# Rim Ready Frontend

Expo frontend for basketball shot analysis, wired to the KinetiQ FastAPI backend and Firebase Realtime Database.

## Runtime setup

1. Review `frontend/.env`
2. Confirm the Firebase `EXPO_PUBLIC_FIREBASE_*` values
3. Confirm `EXPO_PUBLIC_KINETIQ_API_URL` points at the backend, currently `http://172.20.10.13:8000`

## Start the app

```bash
cd frontend
npm install
npx expo start
```

## Backend dependency

The API now lives in the workspace root at `../backend`.

Start it with:

```bash
cd ../backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Flow

- Upload a video from the Upload tab
- The app sends it to the KinetiQ `/analyze` endpoint
- The backend returns overall score, phase scores, feedback, pose GIF, and phase frames
- The full analysis session is saved under `users/{userId}/analysisSessions/{sessionId}` in Firebase Realtime Database
- `shot-breakdown` and `phase-detail` read the saved session instead of using hard-coded placeholder values
