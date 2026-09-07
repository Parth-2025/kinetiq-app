# Behavior changes vs the pre-refactor analyzer

Phase A restructured `backend/analyzer/` into pure modules. The pipeline
reproduces the previous output on the synthetic fixtures **except** for the
deliberate changes below. Baselines: `tests/golden/legacy_*.json` (old),
`tests/golden/current_*.json` (new).

## 1. Phase segmentation (`analyzer/phases.py`)

| Phase | Before | After |
|---|---|---|
| set_point | min shooting-wrist y among frames at/after the load frame | global min shooting-wrist y (see note on search order) |
| load | global min knee angle over the whole clip | min knee angle in frames up to and including set point |
| ready_position | global max knee angle before load | last frame before load within 15° of the pre-load max knee angle |
| release | set_point index + 3 valid frames | after set point, frame of maximum elbow-extension velocity |
| follow_through | last valid frame | last frame after release with the shooting wrist above the shooting shoulder; `None` if the clip ends at/near set point |

**Search-order note:** the legacy code found `load` first (global min knee),
then searched for `set_point` only in frames at/after `load`. The new code
finds `set_point` first (global min wrist-y), then searches for `load` only in
frames at/before `set_point`. The order inverted, but on all six fixtures the
global wrist-y minimum already lies at or after the load frame, so the
`set_point` index is identical to legacy — `test_no_regression.py` pins this.

Rationale: the "+3 frames" rule produced a release frame unrelated to the
actual arm extension and broke on clips at different frame rates or lengths.

### Shooting-side is now fixed for the whole clip

`analyzer/angles.py` picks the shooting arm once per clip — the side whose
wrist reaches the highest point (minimum y) anywhere in the sequence — and
measures every frame on that arm. The legacy code re-decided left/right on
each frame from "which wrist is higher right now", so during the descending
follow-through it silently switched to whichever hand was momentarily higher
(often the guide hand), freezing that arm's angles into the `release` and
`follow_through` metrics. This was the single largest source of wrong scores
on the fixtures.

Observed index deltas on the fixtures (`legacy_*` → `current_*`):

| Fixture | ready_position | release | follow_through |
|---|---|---|---|
| good_form_side | 0 → 11 | 29 → 37 | 59 → 59 |
| shallow_load_side | 0 → 15 | 29 → 37 | 59 → 59 |
| elbow_flare_side | 0 → 11 | 29 → 28 | 59 → 32 |
| front_view | 0 → 11 | 29 → 37 | 59 → 59 |
| truncated | 0 → 11 | 26 → `None` | 26 → `None` |

`load` and `set_point` indices are unchanged on every fixture.

Because `ready_position` now lands on a real pre-load frame instead of frame 0,
the knee angle measured there drops (e.g. good_form_side 166.3° → 152.4°), which
flips that phase from "good" to "warning" and changes its feedback string. This
is the intended effect of the new rule, not a scoring-curve change.

With the shooting side fixed, `follow_through` on the full-length fixtures is
measured on the extended shooting arm (~167°, ideal 155–180°) instead of the
collapsed guide arm, so its score goes 0 → 100 and the overall score rises
sharply: good_form_side / front_view 65.9 → 92.9, shallow_load_side 63.6 →
87.7. `elbow_flare_side` holds the guide arm at 125°: legacy release froze that
125° constant (score 33.3); the new core takes release on the shooting arm
mid-extension (still 33.3 here because that clip's shooting elbow is also flared
at release by design, but the value is now the real shooting-arm angle), and
`follow_through` moves to frame 32 where the shooting wrist drops below the
shoulder. Overall 60.4 → 63.0.

On `truncated` the clip ends at the set point, so `release` and
`follow_through` are `None`; both phases report `status: "unavailable"` with an
empty `angles_measured` instead of being force-scored 0. The overall score is
the mean of the phases that were actually detected, so it rises
(65.9 → 95.9) and `priority` moves from `follow_through` to `release`.

## 2. Scoring curve (`analyzer/scoring.py`)

Angle metrics (`*_angle`): **unchanged**. The new piecewise `score_metric`
with `falloff = 30.0` is algebraically identical to the old
`100 - (deviation / 30) * 100` curve. `test_no_regression.py` confirms every
non-tilt `set_point` metric score matches the legacy baseline byte-for-byte.

Tilt metrics (`shoulder_tilt`, `hip_tilt`): **tightened**. The old curve
divided the tilt deviation by 30, so a tilt of 0.09 (about 8° of lean)
scored ~99.8 — effectively unscored. The new `falloff` is 0.08 (0.10 for
`release.shoulder_tilt`), so the same tilt scores ~50. This changes the
per-metric score for tilt and the phase score for any phase whose ideals
include a tilt metric (`ready_position`, `release`). The synthetic fixtures
use small tilts (0.01–0.02), so their tilt-metric scores stay at or near 100
and the tightened curve is not visible in `current_*.json`; the change is
covered directly by `test_scoring.py`.

## 3. `ideal` range formatting

The measured-angle `ideal` string is now formatted with `:g`
(`f"{lo:g}–{hi:g}"`), so tilt bands render as `0–0.04` where the old engine
wrote `0.0–0.04`. Cosmetic only; the numeric bands are unchanged.

## 4. Additive response fields

`camera_view` (`"side" | "front" | "oblique"`) and `confidence` (0–1) are
new top-level fields on `POST /analyze`. On the fixtures: side views score
`confidence` ≈ 0.85, `front_view` scores ≈ 0.28. Front / oblique views yield
`confidence <= 0.4`; the analysis still runs. Nothing existing was removed.

## 5. Known limitations (Phase B follow-ups)

- `analyzer/pose.ensure_model()` serialises the model download with a
  `threading.Lock` only — safe for a single-process server, not for multiple
  worker processes. There is no size/checksum check on the downloaded model,
  so a truncated download would be cached until the file is removed by hand.
  `_MODEL_URL` pins the `latest` tag rather than a fixed model revision.
- `tests/test_core_purity.py` enforces the pure/IO boundary by a
  non-transitive AST scan over an explicit module list (`geometry`,
  `scoring_curve`, `camera`, `skeleton`, `pipeline`, `registry`,
  `sports/base`, and `sports/basketball/{__init__,metrics,phases,scoring}`).
  `tests/test_core_import_isolation.py` adds a subprocess check that the
  core plus basketball's analysis path import with `cv2`/`PIL`/`mediapipe`
  poisoned. Both must be extended by hand when a new sport is added.
- `SportPlugin.segment` returns one frame index per phase
  (`{phase: int | None}`). Cyclic motions (e.g. a running gait cycle) that
  need per-phase aggregates across repetitions will need a richer return
  shape; that is an extension point for the running sub-project, not a
  change to make now.
- `POST /analyze` reads the whole upload into memory with no size cap.
- On the `/analyze` error path the temp file is created just outside the
  `try/finally` that unlinks it, so a failure between `NamedTemporaryFile` and
  the `try` would orphan it. Harmless in practice; tighten when the handler is
  next touched.

## 6. Multi-sport architecture (sub-project A)

The analyzer pipeline is now sport-pluggable. `analyzer/angles.py`,
`phases.py`, `scoring.py`, and `rendering.py` were split into a
sport-agnostic core (`geometry`, `scoring_curve`, `camera`, `skeleton`,
`pipeline`, `registry`) and a first plugin at
`analyzer/sports/basketball/` implementing the `SportPlugin` ABC
(`frame_metrics` / `segment` / `score` / `render`).

Basketball's analysis output is unchanged — `tests/golden/current_*.json`
regenerated byte-identical.

`analyzer.registry` and `analyzer.pipeline` import without `cv2`/`PIL`;
basketball's skeleton/GIF rendering is lazy-loaded inside
`BasketballPlugin.render()` only.

### API changes

- `POST /analyze` now requires a `sport` form field. Missing → `400
  {"detail": "sport is required"}`; unknown → `400 {"detail": "unknown
  sport 'x'; supported: basketball"}`. This is a breaking change for any
  caller that posted only `video`.
- `POST /analyze` responses gain three additive top-level keys: `sport`,
  `motion`, `phase_order`. Everything else is unchanged.
- New `GET /sports` returns `[{name, display_name, motion, phase_order}]`.

## 7. Persistence layer (B1)

A Postgres persistence layer now sits behind the API for user profile,
sports selection, and analysis sessions. New packages `backend/db/`,
`backend/auth/`, `backend/routers/` (independent of `analyzer/` — enforced
by `tests/test_layering.py`).

- Auth: every `/me/*` request needs `Authorization: Bearer <Auth0 access
  token>`. The backend validates it against `https://<AUTH0_DOMAIN>/userinfo`
  with a 5-minute in-process cache and upserts a `users` row. Single
  process only — a cold start re-hits `/userinfo` once per token.
- Endpoints: `GET/PATCH /me`, `GET /me/username-available`,
  `GET/PUT/POST/DELETE /me/sports*`, `POST/GET /me/sessions*`,
  `GET /me/stats`. Stats are derived from `analysis_sessions`, never
  stored.
- Config: `KINETIQ_DATABASE_URL`, `KINETIQ_AUTH0_DOMAIN`,
  `KINETIQ_TEST_DATABASE_URL` (tests). Migrations: `alembic upgrade head`.
- Local: `docker compose -f backend/docker-compose.yml up -d`.
- Deploy: `render.yaml` (Render free web service) + Neon free Postgres.
