# KinetiQ Frontend

Expo SDK 54 app for KinetiQ training analysis and the Performance Studio.

## Runtime configuration

Set these values in `frontend/.env` for local development:

- `EXPO_PUBLIC_AUTH0_DOMAIN` and `EXPO_PUBLIC_AUTH0_CLIENT_ID` for the Auth0 application
- `EXPO_PUBLIC_KINETIQ_API_URL` for the API base URL

Local API URLs such as `http://127.0.0.1:8000` are for development only. A release build must use the deployed HTTPS API host; configure it through the release environment and verify it before building. Do not ship the current sample/private-network endpoint.

## Auth0 callback configuration

The native app scheme is `rimready` to preserve the existing Auth0 redirect flow. Do not change the scheme or native callback URL without updating and verifying the Auth0 Allowed Callback URLs for the release application. Include the web callback only if web sign-in is part of that release. CAPTCHA and bot-detection behavior is configured in the Auth0 dashboard.

## Run locally

```bash
npm install
npx expo start
```

Use `npx expo start --ios`, `npx expo start --android`, or `npx expo start --web` to select a target. Native camera capture is available only in a native build; web users select a video file.

## Native builds

`eas.json` defines development, internal preview, and store production profiles. Configure the EAS project and Apple/Android signing credentials before attempting store builds. A production EAS build has not been run and no signing credentials or EAS project ID are committed here.

The package identifiers are `io.kinetiq.app` for iOS and Android. Treat these as permanent once the corresponding store records are created. The existing Auth0 scheme remains `rimready`.

## Backend

The API source is in `../backend`. See [backend setup](../backend/studio/README.md) for the Studio service, migrations, and worker. The release API must be reachable over HTTPS from supported devices.

## Release readiness

Ready sessions now offer **Save mannequin revision** to the session owner.
Select a saved revision to replay fixed estimated limb lengths with neutral
skinned meshes, or select **Landmark preview** for the original joint display.
The backend needs migration `0009_display_rig_revisions`. Saved display fitting
does not change metrics or calibrate anatomy from height/wingspan. Device GL
verification remains pending; see the root implementation checklist.

See [App Store and native beta readiness](../docs/release/app-store-readiness.md) for the concrete release gates, required external configuration, and validation limits.
