# Performance Studio backend

Additive prototype domain under `/studio`. Existing `/me` and legacy analysis routes remain separate.

## Run locally

Use an existing PostgreSQL database through `KINETIQ_DATABASE_URL`, or start the supplied development database with Docker. The migrations were applied to an isolated local test database; this does not migrate any deployment database.

From the repository root, with Docker installed:

```sh
docker compose -f backend/docker-compose.yml up -d
```

From `backend/`, with the project Python environment and Auth0 configuration:

```sh
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m alembic upgrade head
uvicorn main:app --reload --port 8000
```

In another terminal, also from `backend/` and using the same environment:

```sh
source .venv/bin/activate
python -m studio.worker
```

The API and worker must use the **same PostgreSQL database and media directory**. The first analysis downloads the MediaPipe Heavy model to the configured model cache. No model was downloaded as part of this implementation.

| Setting | Purpose |
| --- | --- |
| `KINETIQ_DATABASE_URL` | Existing PostgreSQL connection string |
| `KINETIQ_AUTH0_DOMAIN` | Existing Auth0 tenant, required for authenticated endpoints |
| `KINETIQ_STUDIO_MEDIA_DIR` | Private temporary recordings directory; defaults to `backend/.studio-media` |
| `KINETIQ_STUDIO_UPLOAD_LIMIT_MB` | Upload limit, default 150 MB |
| `KINETIQ_MODEL_CACHE_DIR` | Existing model cache location |
| `KINETIQ_CORS_ORIGINS` | Explicit frontend origins for deployment |

Do not publicly serve the media directory. Run API and worker on a private writable volume with restricted permissions. Production needs request-body limits at ingress, storage encryption/lifecycle, worker resource isolation, monitoring, backups, and a deployment-specific retention policy.

## Schema and roles

Migrations `0002`–`0008` add account capabilities, athletes, measurement snapshots, teams, memberships, invitations, assignments, practices, manual events, sessions, explicit team shares, feedback, devices, audit records, capture evidence, sensor imports, deletion requests, and tracking job records. They do not convert historical legacy sessions into Studio sessions.

Athlete/coach is a persisted workspace preference. Admin is a separate server-provisioned capability. For an existing signed-in account, a trusted server operator can run:

```sh
python -m studio.admin --subject 'auth0|EXACT_SUBJECT' --grant
python -m studio.admin --subject 'auth0|EXACT_SUBJECT' --revoke
```

The app cannot grant itself administrator access. The current admin screen contains platform counts, analysis capability state, and recent audit records; it is not a complete operations console.

## Ownership and sharing

- Athletes have a canonical account-linked profile and can train without a team.
- Coaches create managed profiles or invite account holders into teams.
- Invitations are random, expire after seven days, and are stored as hashes. Codes are returned only when created.
- Invitation acceptance discloses profile/measurement access. Team membership alone does not share personal session history.
- Team assignment submissions create explicit session shares. Owners can revoke them.
- Leaving a team removes its existing session grants. Rejoining does not restore them.
- Coaches see only owned sessions or explicitly shared sessions for current team members.
- Direct assignments currently support coach-managed profiles. Account-linked athletes receive team assignments.
- Managed-profile claiming uses a one-use, expiring code with explicit preview and acceptance. It does not merge duplicate athlete records; athletes with an existing account profile should join through team membership instead of creating a duplicate managed profile.
- A coach's manually entered practice events and coach-owned sessions remain coach records after an athlete leaves. This differs from revocable sharing of athlete-owned sessions.

## Analysis and retention

1. Create a session with an available skill and explicit left/right shooting side.
2. Upload a video to `/studio/sessions/{id}/video`, with Auth0 authorization.
3. The API writes bounded chunks to a private temporary path and queues the database record.
4. The worker uses a PostgreSQL advisory lock to claim/recover work.
5. MediaPipe Heavy estimates world landmarks. Frames with detected multiple people, poor visibility, or cropped bodies do not produce angle values. Missing values remain `null`.
6. Numeric frames, model hash, coordinate convention, timing provenance, quality counts, and summary ranges are saved. The replay does not retain images.
7. The source is removed before the worker publishes completion/failure. Queued recordings older than 24 hours expire when processed; orphan cleanup runs while the worker runs. This is worker-based cleanup, not an independent storage lifecycle guarantee.
8. Session deletion removes motion, summary values, feedback, sharing grants, and local source. A minimal deleted record and audit record remain; backup erasure is not implemented.

Full motion JSON is deferred on list queries. Summaries are stored separately so dashboards do not load every replay.

Supported analysis is **experimental free throw body motion**, sampled at approximately 15 Hz, up to 60 seconds. Reported elbow/knee flexion is 0° at extension. The gate is heuristic and can reject useful footage. No proven accuracy, ball release/outcome, repetition segmentation, technique score, consistency score, physical distance, fatigue, skinned mesh fitting, or automatic practice tracking is claimed.

The other basketball skills are a capability catalogue and support written assignments. A normalized-box association primitive has focused unit coverage, but no person detector feeds it. Practice tracking jobs currently record an unsupported status and empty tracks; they do not analyze uploaded video. Device records are inventory only. Sensor imports accept offline data for protocol exploration, not validated live measurements. Manufacturing, BLE/UWB streaming, multi-camera synchronization, calibration, roster identity tracking, and sport-specific inference remain separate development work.

Account deletion currently creates or cancels a request for an operator. No operator processing route deletes application data or an Auth0 identity. Do not describe request submission as completed deletion.

## Canonical motion and saved interval queries

`GET /studio/sessions/{id}/motion` adapts a ready `studio-motion-1` result to `motion_session.v1`. It preserves the stored record, identifies it by SHA256, and returns 33 named joints in hip-relative model coordinates with X right, Y up, and Z toward the camera. Distances remain model estimates in meters; no calibrated world trajectory or fitted mesh is produced. Times are seconds with decoded-presentation or nominal-fallback provenance. Low-visibility positions remain null while available visibility values are retained. New analyses also record the MediaPipe package version and decoded frame indices; unavailable historical provenance stays null.

`POST /studio/sessions/{id}/motion-query` is coach-only and applies the same session sharing checks. Example body:

```json
{
  "operation": "joint_angle_series",
  "joint": "right_elbow",
  "convention": "flexion_0_at_extension",
  "interval_seconds": {"start": 0.5, "end": 2.5},
  "aggregation": ["min", "max", "mean"]
}
```

Left/right elbow and knee queries use retained numerical points. Intervals include the start and exclude the end, within 0–60 seconds. Responses identify the stored analysis content and measurement snapshot, preserve nulls, report valid-sample coverage and timestamp gaps, and bound input/output to 1,000 frames. Coverage refers to stored samples, not elapsed-time coverage. Unknown contracts return an explicit unsupported response; a missing provider adapter does not establish that the original video is required.

These reads need no retained RGB. Content hashes identify the current stored analysis; immutable reconstruction-history tables, artifact storage, shape fitting, and native-depth contracts remain unfinished. Reported height/wingspan do not alter the angle calculation.

## Validation state

On 2026-10-05, the isolated PostgreSQL test database applied migrations through `0008`; the backend suite (excluding two MediaPipe-marked tests) completed with 234 passing checks after the tracking and comparison access cases were corrected. TypeScript compilation and Expo web, iOS, and Android exports also passed. These checks do not establish production migration safety, live Auth0 behavior, native camera/GPU operation, or scientific measurement accuracy. No signed native build or physical-device evaluation was performed.

On 2026-10-06, the integrated suite passed 254 tests with 2 MediaPipe tests deselected. This includes canonical coordinate/provenance checks, saved-interval query bounds, and source-removal/sharing-revocation tests through the application routes. TypeScript and all three Expo exports passed. This batch adds no database migration or physical-device evidence.

## October 16 implementation update

The procedural skinned display rig and saved revision API are now integrated and tested in an isolated database through migration 0009. Session review retains the landmark preview. The earlier joint-only description above describes the previous baseline; fitted display proportions still do not establish anatomical accuracy. Device GL validation remains pending.

New analyses persist per-candidate body summaries and coverage, preliminary differences for two usable candidates, and per-metric dispersion for three or more. Session review labels these as unconfirmed movement candidates. Actual ball tracking, confirmed shots, release timing, calibrated speed/arc, and spin are pending. The source-resolution ball-evidence contract is in `docs/design/basketball-shot-evidence-v1.md` at the repository root.

Backend regression: 275 passed, 2 MediaPipe tests excluded; geometry, TypeScript, and all platform exports passed. A subsequent pair-comparison adjustment passed focused tests and TypeScript. The configured local development DB was stopped on port 5432, so its migration still needs to run when available. See the root `skinner_implementation_checklist.md` for restart details.
