# KinetiQ Persistence Layer — B1 Design Spec

**Status:** Draft for review
**Date:** 2026-09-05
**Scope:** Sub-project B1 of the multi-sport expansion. Backend persistence + frontend data-layer cutover, core feature subset only.

## Context

The KinetiQ Expo app (`frontend/`, package `rim-ready`) stores all of its
non-analysis state in Firebase Realtime Database, read and written directly
from the client via `firebase/database`: user profile and a `usernames/`
uniqueness index, sports selection (`users/{uid}/sports/active` and
`.../sports/selected/{name}`), analysis sessions and an active-session
pointer, per-user stats (maintained with `runTransaction`), a cross-user
leaderboard (multi-path atomic `update`), friend search (reads the whole
`users/` node), a social inbox, and profile cosmetics. ~14 call sites use
live `onValue` subscriptions.

Access to that Firebase project is gone, so the app's data layer is
broken. This sub-project stands up a real backend persistence layer —
Postgres behind the existing FastAPI service — and moves the frontend off
`firebase/database` onto that API.

Because the surface is large, B is split: **B1 (this spec)** restores the
core loop — auth, profile, sports selection, analysis sessions, stats.
**B2 (later spec)** replaces the social/competitive layer — leaderboard,
friends, social inbox, cosmetics.

There is **no data migration**: the Firebase data is inaccessible, so B1
is a clean start.

## Goals

1. A Postgres schema and Alembic migrations for users, sports selection,
   and analysis sessions.
2. Auth: every API request carries the user's existing Auth0 access token
   as a Bearer header; the backend validates it against Auth0 and resolves
   it to a `users` row. No user id ever appears in a request path.
3. REST endpoints for profile (incl. username uniqueness), sports
   selection, analysis sessions (create / list / get / active pointer),
   and derived stats.
4. Frontend: a small custom hook layer (`useApiQuery` / `useApiMutation`)
   replacing `useDatabaseValue` / `useDatabaseWrite` / `useDatabaseLiveValue`
   with the same return shape, plus refetch-on-focus and
   invalidate-after-mutation. The `firebase` dependency is removed.
5. Runs at $0: Neon free Postgres, Render free web service, docker-compose
   Postgres for local dev and tests.

## Non-Goals

- Leaderboard, friend search, social inbox, profile cosmetics (B2).
- Real-time push (websockets / SSE). B1 is refetch-on-focus + after
  mutations. A shared leaderboard, when B2 adds it, may poll.
- Any change to the `/analyze` pipeline or its tests.
- Migrating existing Firebase data (there is none reachable).
- Multi-process correctness of the in-process token cache (documented
  limitation; single Render instance).
- Offline write queue / optimistic-persistence beyond a simple in-memory
  cache.

## Global Constraints

- Backend: Python 3.11 (`ruff target-version = "py311"`); MediaPipe has no
  3.13 wheels.
- `ruff check .` from `backend/` stays clean (`select = E,F,I,UP,B`,
  `ignore = E501`, `line-length = 100`, `src = ["."]`).
- Backend tests run `cd backend && python -m pytest`, `pythonpath = ["."]`.
- New backend deps pinned: `sqlalchemy~=2.0`, `alembic~=1.13`,
  `psycopg[binary]~=3.2`; `httpx` promoted from dev to runtime.
- The analyzer core (`analyzer/**` except `sports/**/rendering.py`) keeps
  importing only numpy/stdlib — the persistence layer must not be imported
  by anything under `analyzer/`.
- Frontend: Expo Router app, TypeScript strict, `expo lint` clean. No new
  runtime dependency for the data layer (custom hooks, not TanStack Query).
- Frontend auth flow (`context/auth-context.tsx`, Auth0 PKCE) is unchanged
  except that the Auth0 **access token** is now also stored for and sent to
  the KinetiQ API.
- All work on a dedicated branch, never `main`. Commits attributed to
  Parth Mohan <parthmohan2006@gmail.com>.
- This spec assumes sub-project A (multi-sport backend architecture) is
  present — B1 branches on top of it; `analysis_sessions.sport` and the
  `/analyze` response's `sport` field are A's.

## Architecture

### Backend layout

```
backend/
  api.py                 # existing /analyze router — unchanged
  main.py                # + include_router(profile, sports, sessions, stats); + startup ping
  settings.py            # + database_url, auth0_domain
  db/
    __init__.py
    session.py           # engine, SessionLocal, get_db() dependency
    models.py            # User, UserSport, AnalysisSession (SQLAlchemy 2.0 declarative)
  auth/
    __init__.py
    dependency.py        # current_user() dependency; _TokenCache
  routers/
    __init__.py
    profile.py           # GET /me, PATCH /me/profile, GET /me/username-available
    sports.py            # GET /me/sports, PUT /me/sports/active,
                         #   POST /me/sports/selected, DELETE /me/sports/selected/{sport}
    sessions.py          # POST/GET /me/sessions, GET /me/sessions/{id}, GET /me/sessions/active
    stats.py             # GET /me/stats
  alembic/
    env.py
    versions/0001_initial.py
  alembic.ini
  docker-compose.yml     # postgres:16 for dev + tests
  render.yaml            # backend web service + release: alembic upgrade head
```

`db/`, `auth/`, `routers/` are new and independent of `analyzer/`. Nothing
in `analyzer/` imports them.

### Request path

```
frontend request
  Authorization: Bearer <auth0 access token>
        │
        ▼
current_user() dependency
  ├─ token in _TokenCache and not expired? → use cached sub + claims
  └─ else GET https://{auth0_domain}/userinfo  (Bearer)
         ├─ 200 → cache {sub, email, name, picture} for AUTH_CACHE_TTL (300 s)
         └─ non-200 / network error → HTTPException(401)
        │
        ▼
  SELECT * FROM users WHERE auth0_sub = :sub
    ├─ found → refresh email/name/picture if changed, return row
    └─ absent → INSERT and return row
        │
        ▼
router handler uses current_user.id for every query
```

## Data Model

SQLAlchemy 2.0 declarative; one Alembic migration `0001_initial`.

### `users`

| column | type | notes |
|---|---|---|
| `id` | `UUID` pk | `server_default=gen_random_uuid()` (`pgcrypto`) |
| `auth0_sub` | `text` | `unique`, `not null` |
| `email` | `text` | nullable |
| `name` | `text` | nullable |
| `picture` | `text` | nullable |
| `username` | `text` | `unique`, nullable until set |
| `active_sport` | `text` | nullable; must be one of the user's `user_sports` |
| `active_session_id` | `UUID` | nullable, `ForeignKey("analysis_sessions.id", ondelete="SET NULL")` |
| `created_at` | `timestamptz` | `server_default=now()` |
| `updated_at` | `timestamptz` | `server_default=now()`, `onupdate=now()` |

### `user_sports`

| column | type | notes |
|---|---|---|
| `user_id` | `UUID` | `ForeignKey("users.id", ondelete="CASCADE")` |
| `sport` | `text` | e.g. `"basketball"` |
| `added_at` | `timestamptz` | `server_default=now()` |

Primary key `(user_id, sport)`.

### `analysis_sessions`

| column | type | notes |
|---|---|---|
| `id` | `UUID` pk | `server_default=gen_random_uuid()` |
| `user_id` | `UUID` | `ForeignKey("users.id", ondelete="CASCADE")`, indexed |
| `sport` | `text` | `not null` |
| `overall_score` | `numeric` | nullable; copied out of `analysis["overall_score"]` at write time for cheap list/stats queries |
| `source` | `JSONB` | the client's `VideoAssetMetadata` |
| `analysis` | `JSONB` | the full `AnalysisResult`, including base64 `pose_gif` / `phase_images` |
| `created_at` | `timestamptz` | `server_default=now()` |

Index `ix_sessions_user_created` on `(user_id, created_at DESC)`.

The circular FK (`users.active_session_id` → `analysis_sessions.id`,
`analysis_sessions.user_id` → `users.id`) is created with
`use_alter=True` so Alembic emits the constraint after both tables exist.

### Derived stats (no table)

`GET /me/stats` computes, over `analysis_sessions` for `current_user`
(optionally filtered by `?sport=`):

- `shotsAnalyzed` = `count(*)`
- `videosUploaded` = `count(*)` (one session per upload in B1)
- `totalScore` = `round(sum(overall_score))`
- `avgScore` = `round(avg(overall_score), 1)` (`0` when no rows)
- `bestScore` = `round(max(overall_score))` (`0` when no rows)
- `latestScore` = `overall_score` of the newest row (`0` when none)
- `exp` = `videosUploaded * VIDEO_EXP_REWARD` (`VIDEO_EXP_REWARD = 50`)
- `level`, `progressPct`, `currentLevelExp`, `nextLevelExp` from the pure
  formula ported verbatim from `frontend/services/user-stats.ts`
  (`BASE_LEVEL_EXP = 50`, `getTotalExpRequiredForLevel`,
  `calculateLevelProgress`) into `backend/routers/stats.py`.

## API

Base URL: `EXPO_PUBLIC_KINETIQ_API_URL` (already a frontend runtime
config). Every route below requires `Authorization: Bearer <token>` and
acts only on the authenticated user. Errors: `401` (bad/missing token),
`400` (bad body), `404` (session id not owned / not found), `409`
(username taken).

### Profile

- `GET /me` → `{ id, email, name, picture, username, active_sport, active_session_id }`.
  Creates the `users` row on first call.
- `PATCH /me/profile` — body `{ name?: str, username?: str }`. `username`
  is lowercased, then must match `^[a-z0-9_]{3,20}$` (else `400`), and must
  be free → else `409 {"detail": "username taken"}`. Returns the updated
  `GET /me` shape.
- `GET /me/username-available?u=<name>` → `{ "available": bool }`.

### Sports

- `GET /me/sports` → `{ "active": str | null, "selected": [str] }` (selected sorted).
- `PUT /me/sports/active` — body `{ "sport": str }`. `400` if `sport` is
  not in the user's selected set. Sets `users.active_sport`.
- `POST /me/sports/selected` — body `{ "sport": str }`. Upserts into
  `user_sports`; if it was the first selected sport, also sets it active.
  Returns the `GET /me/sports` shape.
- `DELETE /me/sports/selected/{sport}` — removes from `user_sports`. If it
  was `active_sport`, `active_sport` is set to the alphabetically-first
  remaining selected sport, or `null` if none. Returns the
  `GET /me/sports` shape.

### Analysis sessions

- `POST /me/sessions` — body `{ "sport": str, "source": object, "analysis": object }`.
  Inserts a row (`overall_score` pulled from `analysis["overall_score"]`,
  `null` if absent), sets `users.active_session_id` to the new id, returns
  `{ id, sport, overall_score, created_at }`.
- `GET /me/sessions?sport=&limit=&before=` — newest first.
  `limit` default 20, max 100. `before` is an ISO timestamp cursor
  (`created_at < before`). Returns
  `[{ id, sport, overall_score, created_at }]` — **no `analysis` / `source` blob**.
- `GET /me/sessions/{id}` → `{ id, sport, overall_score, source, analysis, created_at }`.
  `404` if the row is not owned by `current_user`.
- `GET /me/sessions/active` → the full session shape for
  `users.active_session_id`, or `null`.

### Stats

- `GET /me/stats?sport=` → the derived-stats object above. Read-only;
  never written directly (it is a projection of `analysis_sessions`).

## Auth mechanism

`backend/auth/dependency.py`:

- `AUTH_CACHE_TTL = 300` seconds. `_TokenCache` is a module-level
  `dict[str, tuple[float, dict]]` (token → `(expires_at, claims)`), guarded
  by a `threading.Lock`, with opportunistic eviction of expired entries on
  read. Documented single-process limitation.
- `async def current_user(authorization: str = Header(...), db = Depends(get_db)) -> User`:
  1. Parse `Bearer <token>`; missing/malformed → `401`.
  2. Cache hit and unexpired → `claims`. Else
     `httpx.AsyncClient().get(f"https://{settings.auth0_domain}/userinfo", headers=...)`;
     non-200 or exception → `401`; 200 → `claims = res.json()`; cache it.
  3. `sub = claims["sub"]`. `SELECT ... WHERE auth0_sub = sub`. If absent,
     `INSERT` with `email/name/picture` from `claims`. If present and any
     of `email/name/picture` changed, `UPDATE` them.
  4. Return the `User`.
- Tests override this dependency (`app.dependency_overrides[current_user]`)
  with a factory returning a seeded fake user — no network, no Auth0.

## Frontend data layer

### New files

- `frontend/config/api.ts` — `apiFetch(path, init?)`: prefixes
  `requireRuntimeConfig("kinetiqApiUrl")`, sets
  `Authorization: Bearer ${token}` from a token accessor registered by
  `AuthProvider`, `Content-Type: application/json` for bodies, throws
  `ApiError { status, detail }` on non-2xx.
- `frontend/hooks/use-api.ts`:
  - `useApiQuery<T>(key: string | null, path: string | null)` →
    `{ value: T | null, isLoading, error, refetch }`. Same shape as the
    old `useDatabaseValue`. Holds results in a module-level `Map` keyed by
    `key`; re-fetches when `key`/`path` change, on mount, and via
    `useFocusEffect` when the screen regains focus.
  - `useApiMutation<TBody, TResult>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE")` →
    `{ mutate, isLoading, error }`. Same shape as the old
    `useDatabaseWrite` (`mutate` ≈ `write`). On success calls
    `invalidate(prefix)` for the affected keys.
  - `invalidate(keyPrefix: string)` — drops matching cache entries and
    signals mounted `useApiQuery` consumers to refetch.

### Token wiring

`context/auth-context.tsx`: it already obtains an Auth0 `accessToken`
(`fetchUserInfo(accessToken)`); currently only the user object is kept in
React state (web additionally persists the token to `localStorage` under
`auth0_token`; native persists nothing). B1 keeps the access token in
context state as well and exposes it through an accessor that
`config/api.ts` registers with. No new storage dependency — native
sessions already do not survive an app restart, and that is unchanged. No
change to the PKCE flow, discovery, token exchange, or callback handling.

### Rewired screens/hooks (component logic unchanged; Firebase path → API call)

- `app/sports.tsx` — `useApiQuery("sports", "/me/sports")`;
  `useApiMutation` for add/activate.
- `app/(tabs)/index.tsx` — active sport from `/me/sports`.
- `app/(tabs)/upload.tsx` — active sport from `/me/sports`; after a
  successful `/analyze`, `POST /me/sessions` then navigate.
- `app/shot-breakdown.tsx`, `app/phase-detail.tsx` — active session from
  `GET /me/sessions/active` (or `/me/sessions/{id}` when an id is routed).
- `app/player-stats.tsx` — `GET /me/sessions` (list) + `GET /me/stats`.
- `hooks/use-user-profile.ts` — `GET /me`.
- `hooks/use-user-stats.ts` — `GET /me/stats`.

### Removed

- `frontend/hooks/use-database.ts`
- `frontend/services/user-stats.ts`, `services/user-profile.ts`,
  `services/analysis-sessions.ts` (their logic moves server-side or into
  the rewired screens)
- the `firebase` dependency from `package.json`

### B2 features held on a stub

`app/(tabs)/leaderboard.tsx`, `app/friends/add.tsx`,
`hooks/use-social-inbox.ts`, `hooks/use-profile-customization.ts`,
`services/leaderboard.ts`, `services/profile-customization.ts` still import
`@/config/firebase`. B1 replaces `config/firebase.ts` with a stub whose
`db` getter throws `"persistence for this feature returns in B2"`, and
those four screens render a "coming back soon" placeholder instead of
calling it. B2 deletes the stub and implements them against the API.

## Data Flow

```
Upload screen
  video ──> POST /analyze (sport)         [unchanged, sub-project A]
         ──> AnalysisResult
  AnalysisResult ──> POST /me/sessions {sport, source, analysis}
                 ──> {id} ; server sets users.active_session_id
  navigate to shot-breakdown
    ──> GET /me/sessions/active  ──> full AnalysisResult from JSONB

Sports screen
  GET /me/sports ──> {active, selected}
  tap add    ──> POST /me/sports/selected {sport} ──> invalidate("sports")
  tap switch ──> PUT  /me/sports/active   {sport} ──> invalidate("sports")

Stats / profile
  GET /me           ──> profile row
  GET /me/stats     ──> aggregate over analysis_sessions
```

## Error Handling

- Missing/expired/invalid token → `401` at `current_user`, before any DB
  work. The frontend `apiFetch` maps `401` to a "session expired" state
  that triggers `login()`.
- `PATCH /me/profile` with a taken username → `409`; the DB `unique`
  constraint is the backstop (catch `IntegrityError` → `409`).
- `PUT /me/sports/active` with an unselected sport → `400`.
- `GET /me/sessions/{id}` / `active` for a row not owned by the caller →
  `404` (never `403`, to not leak existence).
- `POST /me/sessions` with a non-object `analysis` / `source` → `400`.
- DB unreachable at startup → `main.py` logs and the app still boots (so
  `/health` and `/analyze` keep working); the `/me/*` routes return `503`
  until the DB is reachable.
- Auth0 `/userinfo` timeout → `401` with `{"detail": "auth check failed"}`
  (the client retries the request, not the login).

## Testing

### Backend

- A `postgres` fixture: connect to `KINETIQ_TEST_DATABASE_URL`
  (docker-compose default `postgresql+psycopg://kinetiq:kinetiq@localhost:5432/kinetiq_test`),
  run `alembic upgrade head` once per session, wrap each test in a
  transaction rolled back on teardown.
- `client` fixture: `TestClient(app)` with
  `app.dependency_overrides[current_user]` returning a seeded fake `User`
  and `get_db` bound to the test transaction.
- Per router: happy path + each documented error code. Specifically —
  `GET /me` creates then reuses a row; `PATCH /me/profile` 409 on a taken
  username (two users); sports active-must-be-selected 400; delete-active
  reassigns; `POST /me/sessions` sets the active pointer and pulls
  `overall_score` out of the blob; `GET /me/sessions` omits the blob and
  honours `limit`/`before`; `GET /me/sessions/{id}` 404 across users;
  stats aggregation math against a fixed set of rows; the ported
  `calculateLevelProgress` matches a table of `(exp → level, pct)` values
  taken from the current TS implementation.
- `auth/dependency.py`: unit-test `_TokenCache` TTL + eviction and the
  `/userinfo` non-200 → `401` path with `httpx` mocked (`respx` or a
  monkeypatched `AsyncClient`).
- `test_core_purity.py` / the analyzer suite are untouched and must stay
  green; add an assertion (or a new `test_layering.py`) that no
  `analyzer/**` module imports `db`, `auth`, or `routers`.
- `ci.yml` gains a `services: postgres:16` container and
  `KINETIQ_TEST_DATABASE_URL`; the migration runs before pytest.

### Frontend

- `expo lint` clean; `tsc --noEmit` clean.
- `hooks/use-api.ts`: a light test (Jest or a manual harness — match
  whatever the repo already has; if nothing, a `__tests__/use-api.test.ts`
  with a mocked `fetch`) for cache hit/miss, `invalidate`, and error
  mapping.
- No E2E in B1.

## Deployment

- **Postgres:** Neon free project; copy its pooled connection string into
  `KINETIQ_DATABASE_URL` (`postgresql+psycopg://…?sslmode=require`).
- **Backend:** Render free web service from the repo, root `backend/`,
  build `pip install -r requirements.txt`, pre-deploy
  `alembic upgrade head`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
  Env: `KINETIQ_DATABASE_URL`, `KINETIQ_AUTH0_DOMAIN`, `KINETIQ_CORS_ORIGINS`.
  `render.yaml` checked in.
- **Frontend:** set `EXPO_PUBLIC_KINETIQ_API_URL` to the Render URL.
- Free-tier caveats (documented, not fixed here): Render web service
  cold-starts after 15 min idle; Neon compute suspends when idle; the
  token cache is per-process so a cold start re-hits `/userinfo` once per
  token.

## Open Questions

None blocking. Frontend test tooling: the repo has no test runner
configured for `frontend/`; the plan will either add a minimal Jest setup
for `use-api.ts` or, if that balloons scope, ship `use-api.ts` with a
typed manual smoke and note it. Decided in the plan.
