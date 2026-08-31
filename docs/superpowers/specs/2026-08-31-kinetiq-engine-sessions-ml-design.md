# KinetiQ — Engine Hardening, Session Tracking, and Data-Driven Scoring

**Date:** 2026-08-31
**Repo:** `Parth-2025/KinetiQ` (fork of `sthirum2/KinetiQ`)
**Status:** Approved design — ready for implementation planning

---

## Context

KinetiQ is a basketball shot-form analyzer. A user uploads a short video of a
jump shot; the backend runs MediaPipe pose estimation, computes joint angles per
frame, segments the shot into phases (ready position, load, set point, release,
follow-through), scores each phase against ideal angle ranges, and returns a
score breakdown plus rendered skeleton overlays. The frontend is an Expo app; the
backend is a FastAPI service in `backend/`.

This spec covers continued work on the backend analysis engine — the pose
pipeline, phase segmentation, and form scoring in `backend/analyzer/`. The work
is organized into three sequential phases with a gate after each. A phase does
not begin until the previous gate passes. Phase C is a research spike and never
blocks Phase A or B.

### Current state of `backend/analyzer/`

- `pose_detector.py` — landmark extraction, per-frame angle computation, and all
  OpenCV/PIL rendering (skeleton overlays, GIF, ideal-form diagram) in one file.
- `shot_analyzer.py` — phase segmentation and per-phase angle/frame extraction.
- `feedback_engine.py` — per-phase scoring and text feedback.
- `main.py` — FastAPI app with a single `POST /analyze` endpoint.

### Known problems (addressed by this spec)

1. **No tests** anywhere in the repository.
2. **Fragile phase segmentation.** `detect_shot_phases` picks "release" as
   literally the third valid frame after set point; "load" is the single frame of
   minimum knee angle. No use of motion velocity.
3. **No camera-view handling.** Side-view and front-view clips are scored with
   the same angle logic, though front-view makes most sagittal-plane angles
   meaningless.
4. **Ad-hoc scoring curve.** `_score_value` divides deviation by a magic `30.0`.
   `IDEAL_RANGES` in `pose_detector.py` is missing `ready_position` even though
   `feedback_engine.py` scores it.
5. **Blocking work on the event loop.** `extract_landmarks_from_video` is
   synchronous and CPU-bound but runs inside an `async` endpoint.
6. **Model download per request.** The MediaPipe model is fetched to `/tmp`
   inside the request path, with no locking.
7. **Repo hygiene.** `__pycache__/*.pyc` files are committed. `requirements.txt`
   is a 40-line full environment freeze with no runtime/dev split.
8. **CORS** is `allow_origins=["*"]`.
9. **No persistence.** Analysis results are returned and discarded.
10. **Single shot only.** A clip with multiple shots is not handled.

---

## Phase A — Engine hardening

**Goal:** the pose → angles → phases → score pipeline is correct, documented, and
covered by tests that run without video files or MediaPipe installed.

### A.1 Module structure

`backend/analyzer/` is reorganized so the analysis core is pure and the
I/O-heavy parts are isolated:

| Module | Responsibility | Dependencies |
|---|---|---|
| `pose.py` | Video → list of per-frame landmark dicts. MediaPipe only. | mediapipe, opencv, numpy |
| `angles.py` | Per-frame landmark dict → per-frame joint angles and tilts. Pure functions. | numpy |
| `phases.py` | Angle sequence → phase frame indices + camera-view classification + confidence. Pure functions. | numpy |
| `scoring.py` | Phase angles → per-phase scores, overall score, priority phase. Pure functions. | none (stdlib) |
| `segmentation.py` | (Phase B) Full landmark sequence → list of shot frame ranges. Pure functions. | numpy |
| `rendering.py` | All skeleton overlays, pose GIF, ideal-form diagram. | opencv, PIL, numpy |
| `api.py` | FastAPI router and request/response models. | fastapi |
| `main.py` | App construction, middleware, settings wiring. | fastapi |
| `settings.py` | `pydantic-settings` config object. | pydantic-settings |

The analysis core is `angles.py`, `phases.py`, `scoring.py`, and later
`segmentation.py`. None of these import FastAPI, a database, MediaPipe, or an
image library. They operate on plain dicts, lists, and numpy arrays and are
tested directly against checked-in fixtures.

`pose_detector.py`, `shot_analyzer.py`, and `feedback_engine.py` are removed;
their logic moves into the modules above. Import sites in `main.py` are updated.

### A.2 Phase segmentation rewrite (`phases.py`)

Replace positional heuristics with motion-signal detection over the sequence of
valid frames:

- **set point** — frame of the global minimum of shooting-wrist `y` (highest ball
  position). Unchanged in intent; kept as the anchor.
- **load** — frame of deepest knee flexion (minimum knee angle) within the window
  from the start of the clip up to set point. Previously searched the whole clip.
- **release** — after set point, the frame where shooting-elbow extension
  *velocity* (first difference of elbow angle over time) is maximal. Previously
  "set point index + 3".
- **ready_position** — the last frame before `load` where knee angle is within
  15° of its clip-wide maximum (a stable upright stance), falling back to the
  first valid frame.
- **follow_through** — the last frame after `release` where the shooting wrist is
  still above the shooting shoulder, falling back to the last valid frame.

**Camera-view classification.** From the median over the clip of
`|shoulder_x_left - shoulder_x_right| / |hip_y_center - shoulder_y_center|`
(torso width over torso height in normalized coords): a low ratio indicates a
side view (shoulders nearly aligned in x), a high ratio a front/oblique view.
`phases.py` returns `camera_view` ∈ {`side`, `front`, `oblique`} and a
`confidence` ∈ [0, 1]. `front` and `oblique` yield `confidence ≤ 0.4`. The API
surfaces this; scoring still runs but the response is marked low-confidence.

**Output.** `segment_phases(angles_list)` returns:

```python
{
  "phases": {"ready_position": int|None, "load": int|None, "set_point": int|None,
             "release": int|None, "follow_through": int|None},
  "camera_view": "side" | "front" | "oblique",
  "confidence": float,
}
```

### A.3 Scoring rewrite (`scoring.py`)

Each metric gets an explicit ideal band and a falloff width, colocated:

```python
IDEALS = {
  "ready_position": {
    "knee_angle":    {"lo": 160, "hi": 175, "falloff": 25},
    "shoulder_tilt": {"lo": 0.0, "hi": 0.04, "falloff": 0.08},
    "hip_tilt":      {"lo": 0.0, "hi": 0.04, "falloff": 0.08},
  },
  "load":           {"knee_angle": {"lo": 80, "hi": 110, "falloff": 30}, ...},
  "set_point":      {"elbow_angle": {"lo": 85, "hi": 100, "falloff": 30}, ...},
  "release":        {"elbow_angle": {"lo": 155, "hi": 175, "falloff": 30}, ...},
  "follow_through": {"elbow_angle": {"lo": 155, "hi": 180, "falloff": 30}, ...},
}
```

`ready_position` is now present (it was missing from `IDEAL_RANGES`).

**Score function.** Piecewise linear:

- value inside `[lo, hi]` → `100.0`
- value outside the band → `max(0, 100 * (1 - distance_to_band / falloff))`
  where `distance_to_band = min(|value - lo|, |value - hi|)`

Per-phase score is the mean of its metric scores. Overall score is the mean of
per-phase scores. Priority phase is the lowest-scoring phase. This matches the
current aggregation; only the per-metric curve changes.

Text feedback (currently in `feedback_engine.py`) moves to `scoring.py` unchanged
in wording, reading thresholds from `IDEALS` instead of a second copy of the
numbers.

### A.4 API and runtime (`api.py`, `main.py`, `settings.py`)

- `POST /analyze` response shape is unchanged for a single-shot clip, with two
  additions: `camera_view` and `confidence` at the top level.
- CPU-bound calls (`extract_landmarks_from_video`, rendering) run via
  `fastapi.concurrency.run_in_threadpool`.
- `settings.py` fields: `model_cache_dir` (default `~/.cache/kinetiq`),
  `cors_origins` (default `["*"]`, overridable), `database_url` (Phase B).
- MediaPipe model loading becomes a module-level lazy singleton in `pose.py`,
  downloading to `settings.model_cache_dir` under a file lock, once per process.
- `allow_origins` is read from `settings.cors_origins`.

### A.5 Testing

**Fixtures.** Capture landmark JSON from 6 sample shots and check them into
`backend/tests/fixtures/`:

| Fixture | Purpose |
|---|---|
| `good_form_side.json` | Well-formed side-view shot; scores should be high |
| `shallow_load_side.json` | Knee angle too open at load; load phase scores low |
| `elbow_flare_side.json` | Set-point elbow over-open; set point scores low |
| `front_view.json` | Front-view clip; `camera_view == "front"`, low confidence |
| `no_pose.json` | Frames with no detected pose; pipeline raises the 422 path |
| `truncated.json` | Clip that ends at set point; release/follow-through are `None` |

Each fixture is the output of `pose.extract_landmarks_from_video` serialized to
JSON (numpy arrays as lists, `_frame` / `_raw_landmarks` image data dropped).
A helper `load_fixture(name)` deserializes back to the in-memory shape the core
functions expect.

**Test modules** (`backend/tests/`):

- `test_angles.py` — angle math on hand-constructed landmark dicts (known
  geometry → known angle) plus fixture-driven shape checks.
- `test_phases.py` — segmentation on each fixture: assert phase ordering
  (`ready ≤ load ≤ set_point ≤ release ≤ follow_through` where not `None`),
  camera-view classification, and confidence thresholds.
- `test_scoring.py` — the piecewise curve at boundaries (`lo`, `hi`, `lo - falloff`,
  midpoint), per-phase aggregation, overall score, priority selection, and the
  `ready_position` path that previously had no ideal.
- `test_pipeline_golden.py` — run the full core pipeline (`angles → phases →
  scoring`) on `good_form_side.json` and `shallow_load_side.json` and compare to
  checked-in golden output JSON. Regenerated deliberately with a documented
  rationale when the phase/scoring changes land.
- `test_pose_smoke.py` — marked `@pytest.mark.mediapipe`; runs
  `pose.extract_landmarks_from_video` on a tiny bundled `.mp4`. Skipped in CI
  when MediaPipe is not installed.

Coverage target: every function in `angles.py`, `phases.py`, and `scoring.py`
exercised by a fixture or a hand-built case.

### A.6 Repo hygiene

- Add `.gitignore`: `__pycache__/`, `*.pyc`, `.venv/`, `.cache/`, `*.task`,
  `backend/tests/fixtures/*.mp4` is *not* ignored (the smoke-test clip is small
  and intentional).
- `git rm -r --cached` the committed `.pyc` files.
- Split `backend/requirements.txt` → runtime deps (loosely pinned to
  compatible-release, e.g. `fastapi~=0.135`) and `backend/requirements-dev.txt`
  (`pytest`, `pytest-cov`, `ruff`).
- Add `backend/pyproject.toml` with `[tool.ruff]` and `[tool.pytest.ini_options]`
  (registers the `mediapipe` marker, sets `testpaths`).

### A.7 No-regression guard

Before refactoring, run the *current* `POST /analyze` against the six sample
videos and save the JSON responses as `backend/tests/golden/legacy_*.json`. The
refactored pipeline must reproduce these byte-for-byte **except** for:

- fields affected by the phase-detection change (`release`, `follow_through`
  indices and anything derived from them),
- per-metric scores affected by the new curve,
- the new `camera_view` / `confidence` fields.

Each intentional difference is recorded in a short `CHANGES.md` note next to the
goldens with the before/after values and why.

### A.8 Phase A gate

- `ruff check` clean, `pytest` green locally and in CI.
- `test_pipeline_golden.py` passing against reviewed golden output.
- `CHANGES.md` documents every intentional deviation from legacy behavior.
- No committed `.pyc`; `requirements` split; `settings.py` in use.

---

## Phase B — Session tracking

**Goal:** a clip may contain multiple shots; each analysis is persisted; a
player's scores can be queried over time.

### B.1 Multi-shot segmentation (`segmentation.py`)

`find_shots(angles_list)` scans the full valid-frame sequence for repeated shot
signatures: shooting wrist rising above the shooting shoulder and returning
below it, bracketed by a local knee-flexion minimum before the rise. Returns a
list of `(start_idx, end_idx)` frame ranges, one per detected shot. A clip with
one shot returns a single range, so the single-shot path is a special case of
the general one.

Each range is sliced from the landmark sequence and run through the existing
core pipeline (`angles → phases → scoring`) independently.

### B.2 Persistence (Postgres)

**Stack:** SQLAlchemy 2.x ORM, Alembic migrations, `psycopg` driver.
`DATABASE_URL` from `settings.py`.

**Schema:**

```
players
  id            bigint PK
  external_ref  text unique      -- identifier passed from the frontend auth layer
  created_at    timestamptz

sessions
  id              bigint PK
  player_id       bigint FK -> players.id
  created_at      timestamptz
  source_filename text
  camera_view     text            -- side | front | oblique
  confidence      double precision
  notes           text null

shots
  id                bigint PK
  session_id        bigint FK -> sessions.id
  index_in_session  int             -- 0-based order within the clip
  overall_score     double precision
  priority_phase    text
  phase_scores      jsonb           -- {phase: score}
  angles_measured   jsonb           -- {phase: {metric: {value, ideal, score}}}
  created_at        timestamptz
```

`players` rows are created on first sight of an `external_ref`. No auth is added
to the backend in this phase; the `external_ref` is taken from the request and
trusted, matching the current frontend arrangement.

### B.3 Endpoints (`api.py`)

- `POST /analyze` — accepts an optional `player_ref` form field. Runs
  segmentation; for each detected shot runs the core pipeline. Persists one
  `session` and N `shots`. Response:
  - single shot detected → current response shape, plus `session_id`,
    `camera_view`, `confidence`.
  - multiple shots → adds `shots: [ <per-shot analysis>, ... ]`; the top-level
    fields describe the first shot for backward compatibility.
- `GET /players/{player_ref}/sessions` — list sessions (id, created_at,
  source_filename, shot count, mean overall score), newest first.
- `GET /players/{player_ref}/trend?metric=overall&phase=<phase>` — time series
  of `[{session_id, created_at, value}]`. `metric=overall` uses `overall_score`;
  `metric=phase` requires `phase` and reads `phase_scores[phase]`.

### B.4 Local development

- `docker-compose.yml` at repo root: one `postgres:16` service, a named volume,
  `DATABASE_URL` documented in `backend/README.md`.
- `alembic/` with the initial migration.
- `backend/scripts/seed.py` — inserts one player, three sessions with a rising
  score trend, for manual verification of the trend endpoint. Mirrors the
  pattern used in the author's `ApplicationBot` repo.

### B.5 Testing

- `test_segmentation.py` — fixtures with one, two, and three shots
  (`two_shots.json`, `three_shots.json` added); assert the right number and
  non-overlapping ranges.
- `test_api_sessions.py` — FastAPI `TestClient` against a transactional test
  database (SQLAlchemy rolled back per test): upload → session and shot rows
  created; `sessions` list; `trend` returns points in order for both metric
  modes; unknown `player_ref` → empty list, not an error.

### B.6 Phase B gate

- Multi-shot clip uploads and produces one session with N shot rows.
- `GET .../sessions` and `GET .../trend` return correct data for a seeded player.
- Migrations apply cleanly from empty; `docker-compose up` then seed then query
  works from a clean checkout.
- Phase A tests still green.

---

## Phase C — Data-driven scoring (spike)

**Goal:** determine whether a model trained on the BASKET dataset produces better
shooting assessments than the Phase A heuristic scorer. This is a spike: the
deliverable is a findings document and a go/no-go decision, not necessarily
shipped model code.

### C.1 Dataset reality

`yulupan/BASKET` (HuggingFace, Apache-2.0, contact-info gate) is **not** a
shooting-form dataset. It contains 8–10 minute player highlight reels rated 0–4
on 20 coarse skills, one of which is "shooting". There are no per-shot clips, no
phase labels, and no pose annotations. Consequences:

- Labels are **player-level and weak** for this purpose: one 0–4 number per
  player summarizing many possessions, only loosely tied to jump-shot mechanics.
- Pose and shot segmentation must be produced by this project's own Phase A/B
  code run over the highlight videos.
- A model trained here predicts a **player-level shooting-skill rating**, not the
  per-phase form score KinetiQ's UI shows. Any integration would be an
  additional, optional "overall shooting grade", not a replacement for the
  phase scorer.

This mismatch is the reason Phase C is a spike with a hard decision gate.

### C.2 Pipeline (`ml/`, separate from `backend/`)

1. `ingest.py` — download a bounded subset of BASKET: target ~300 players,
   stratified to balance the shooting rating across 0–4. For each player's
   highlight video, run `pose.extract_landmarks_from_video`, then
   `segmentation.find_shots`, then `angles` + `phases` per detected shot.
2. `features.py` — per shot, build a feature vector (per-phase joint angles,
   tilts, phase durations, release-velocity, camera-view confidence). Aggregate
   to per-player summary features: mean, std, and count of clean side-view shots.
3. `dataset.py` — join per-player features with the shooting label. Use BASKET's
   own train/val/test and cross-league split files so there is no player or
   league leakage.
4. `train.py` — baselines only: gradient-boosted trees (`lightgbm` or
   `sklearn.HistGradientBoostingRegressor`) and an ordinal logistic regression.
   No deep learning.
5. `evaluate.py` — compare, on the held-out test split:
   - model prediction vs BASKET shooting label,
   - Phase A heuristic overall score (aggregated per player the same way) vs
     BASKET shooting label.
   Metrics: Spearman rank correlation and MAE on the 0–4 scale.

### C.3 Decision gate

Write `ml/FINDINGS.md`: dataset subset used, feature definitions, model configs,
and the comparison table.

- **If** the model beats the heuristic on rank correlation by a margin that holds
  across the cross-league test set: add `scoring_backend: "heuristic" | "model"`
  to `scoring.py`, ship the trained artifact under `ml/artifacts/`, and expose an
  optional `overall_shooting_grade` field on the `/analyze` response. The
  per-phase heuristic scorer stays the default and is unchanged.
- **If not:** `FINDINGS.md` records why (label mismatch, weak signal, segmentation
  noise on broadcast footage) and Phase C ends with no change to `backend/`.

Either outcome closes the spike.

### C.4 Phase C gate

- `ml/FINDINGS.md` committed with the comparison table and an explicit go/no-go.
- If go: `scoring_backend` option added with tests; heuristic default unchanged;
  Phase A/B tests green.
- If no-go: no change to `backend/`; the spike branch is merged for its docs and
  scripts only.

---

## Cross-cutting concerns

### Isolation

The analysis core (`angles.py`, `phases.py`, `scoring.py`, `segmentation.py`) has
no dependency on FastAPI, SQLAlchemy, MediaPipe, or an image library. It is a set
of pure functions over dicts, lists, and numpy arrays, tested directly against
JSON fixtures. Everything with I/O — `pose.py`, `rendering.py`, `api.py`,
persistence — sits at the edges and is thin.

### Configuration

One `settings.py` (`pydantic-settings`): `model_cache_dir`, `cors_origins`,
`database_url`. No module reads `os.environ` directly.

### Repository and workflow

- All work on `Parth-2025/KinetiQ` (the fork). One branch per phase:
  `phase-a-engine`, `phase-b-sessions`, `phase-c-spike`. Each merges to the
  fork's `main` when its gate passes.
- Local git identity: `Parth Mohan <parthmohan2006@gmail.com>` so every commit is
  attributed correctly.
- GitHub Actions on the fork: `ruff check` + `pytest` (without the `mediapipe`
  marker) on push and PR.
- After Phase A merges to the fork, optionally open a PR from the fork back to
  `sthirum2/KinetiQ` with the segmentation and scoring fixes, since they improve
  the original.

### Out of scope

- Frontend changes (Expo app). The `/analyze` response stays backward compatible;
  new fields are additive.
- Authentication on the backend. `player_ref` / `external_ref` is trusted input,
  matching the current design.
- Deploying the service anywhere. Local `docker-compose` is the target runtime.
- Deep-learning models in Phase C.
- Real-time / streaming analysis. Input remains an uploaded file.

---

## Phasing summary

| Phase | Delivers | Gate |
|---|---|---|
| A | Restructured, documented, tested analysis core; motion-based phase detection; camera-view flagging; documented scoring curve; repo hygiene; CI | Tests + ruff green in CI; golden pipeline test reviewed; `CHANGES.md` covers every legacy deviation |
| B | Multi-shot segmentation; Postgres persistence (`players`, `sessions`, `shots`); sessions + trend endpoints; docker-compose + migrations + seed | Multi-shot upload persists correctly; sessions/trend endpoints correct on seeded data; Phase A tests still green |
| C | BASKET feature pipeline; baseline models; heuristic-vs-model comparison; `FINDINGS.md` + go/no-go | `FINDINGS.md` committed with comparison table and decision; if go, `scoring_backend` option with tests and unchanged default |
