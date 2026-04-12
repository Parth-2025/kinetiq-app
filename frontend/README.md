# Rim Ready Frontend

Expo frontend for basketball shot analysis, wired to the KinetiQ FastAPI backend and Firebase Realtime Database.

## Runtime setup

1. Review `frontend/.env`
2. Confirm the Firebase `EXPO_PUBLIC_FIREBASE_*` values
3. Confirm `EXPO_PUBLIC_AUTH0_DOMAIN` and `EXPO_PUBLIC_AUTH0_CLIENT_ID` are set for the Auth0 application
4. Confirm `EXPO_PUBLIC_KINETIQ_API_URL` points at the backend, currently `http://172.20.10.13:8000`

## Auth0 CAPTCHA / Bot Detection

This app uses Auth0 Universal Login for both web and native sign-in. The CAPTCHA itself is rendered by Auth0, not by Expo, so enabling the challenge requires an Auth0 dashboard change in addition to the frontend code in this repo.

1. In the Auth0 Dashboard, enable Universal Login for the application.
2. Turn on Bot Detection for the tenant so Auth0 can require a CAPTCHA challenge during suspicious login or signup attempts.
3. Make sure the application's Allowed Callback URLs include the Expo web callback and native callback handled by `frontend/context/auth-context.tsx`.
4. If Auth0 redirects back with a CAPTCHA or verification error, the login screen will now display that message instead of silently bouncing back to `/login`.

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
