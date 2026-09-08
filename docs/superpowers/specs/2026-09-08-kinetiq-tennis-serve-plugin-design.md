# KinetiQ Tennis Serve Plugin — Design Spec

**Status:** Draft for review
**Date:** 2026-09-08
**Scope:** Sub-project C of the multi-sport expansion. Backend only.

## Context

Sub-project A turned KinetiQ's basketball analyser into a plugin: a
sport-agnostic pipeline (`analyzer/pose.py`, `geometry.py`,
`scoring_curve.py`, `camera.py`, `skeleton.py`, `pipeline.py`,
`registry.py`) plus a `SportPlugin` interface (`analyzer/sports/base.py`),
with basketball refactored into `analyzer/sports/basketball/` as the first
plugin. `POST /analyze` takes a required `sport` field and `GET /sports`
lists what is analysable.

This spec adds the **second plugin: tennis serves**. It introduces no
shared-code changes beyond registering the plugin and widening two test
allow-lists. Everything tennis-specific lives under
`analyzer/sports/tennis/`.

### Decomposition (for reference — only C is in scope here)

| # | Sub-project | Depends on | State |
|---|---|---|---|
| A | Multi-sport backend architecture | — | done, merged |
| B1 | Persistence layer / Firebase replacement | — | done, merged |
| **C** | Tennis serve plugin (this spec) | A | this spec |
| D | Running gait plugin | A | not started |
| E | Frontend multi-sport wiring | A, B | not started |

## Goals

1. A `TennisPlugin(SportPlugin)` that analyses a single tennis serve from
   a MediaPipe pose sequence: a 6-phase serve model, a per-frame metric
   set, literature-derived ideal bands, per-phase feedback, and
   per-phase ideal-pose overlays.
2. Registered in `analyzer/registry.py` so `GET /sports` lists it and
   `POST /analyze` with `sport=tennis` routes to it.
3. Every tennis test runs with no video and no MediaPipe, using a
   deterministic synthetic serve fixture — the same approach used for the
   basketball fixtures.
4. Zero change to basketball behaviour: the basketball golden regression
   tests stay byte-identical and untouched.

## Non-Goals

- Racket or ball tracking. MediaPipe Pose gives body landmarks only; the
  **dominant wrist is the racket proxy** throughout. Contact is "hitting
  hand at its highest point", not "ball met strings".
- Any frontend change (sub-project E). `GET /sports` will list "Tennis"
  and the B1 sport picker will show it; tennis analyses render with
  generic phase formatting in the current UI until E. This is a known
  limitation, not a bug.
- Downloading or processing any dataset. There is no open tennis-serve
  biomechanics dataset; ideal bands come from the published serve model
  (see "Ideal bands" below) and are documented with citations in the
  module docstring.
- Multi-serve segmentation, session trends, or serve-type classification
  (flat / slice / kick). One serve per clip, one analysis.
- Any change to the shared pipeline core, the `SportPlugin` ABC, the
  response schema, or the `POST /analyze` / `GET /sports` contracts.

## Global Constraints

Inherited verbatim from sub-project A; repeated here because every task's
requirements implicitly include this section.

- Python 3.11 target (`ruff` `target-version = "py311"`); MediaPipe has no
  3.13 wheels.
- `ruff check .` from `backend/` must stay clean (`select = E,F,I,UP,B`,
  `ignore = E501`, `line-length = 100`, `src = ["."]`).
- Tests run as `cd backend && python -m pytest`, `pythonpath = ["."]`.
- **Core purity.** `analyzer/sports/tennis/metrics.py`, `phases.py`, and
  `scoring.py` import only `numpy` and the standard library — never
  `fastapi`, `cv2`, `PIL`, `mediapipe`, `starlette`. `cv2`/`PIL` are
  permitted only in `analyzer/sports/tennis/rendering.py`.
  `test_core_purity.py` enforces this by AST scan; its `CORE` list gains
  the three non-rendering tennis modules.
- Basketball `/analyze` output is unchanged. `tests/golden/*` and
  `test_no_regression.py` / `test_pipeline_golden.py` are not modified.
  Tennis is purely additive.
- All work on a dedicated branch `tennis-serve-plugin`, never `main`.
- Commits attributed to `Parth Mohan <parthmohan2006@gmail.com>`, with
  trailers `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy`.

## Architecture

### Module layout

```
backend/analyzer/sports/tennis/
  __init__.py    # TennisPlugin(SportPlugin) wiring the four modules below
  metrics.py     # frame_metrics(frames) -> list[dict | None]   (numpy + stdlib only)
  phases.py      # PHASE_ORDER: list[str]; segment(metrics) -> dict
  scoring.py     # IDEALS, PHASE_INFO, PHASE_RESOURCES, generate_feedback, score(phase_metrics)
  rendering.py   # render_all(frames, metrics, phases, phase_metrics) -> dict   (cv2/PIL allowed)
```

Package form, matching basketball. If the four modules prove small enough
to collapse into a single `sports/tennis.py`, the implementation plan may
do so on a line-count basis; the package form is the default.

### `TennisPlugin` (`sports/tennis/__init__.py`)

Mirrors `BasketballPlugin` exactly — thin delegation, no logic, stateless
(one shared instance across all concurrent requests):

```python
from analyzer.sports.base import SportPlugin
from analyzer.sports.tennis import metrics, phases, scoring


class TennisPlugin(SportPlugin):
    name = "tennis"
    display_name = "Tennis"
    motion = "serve"
    phase_order = phases.PHASE_ORDER

    def frame_metrics(self, frames: list) -> list:
        return metrics.frame_metrics(frames)

    def segment(self, metrics_list: list) -> dict:
        return phases.segment(metrics_list)

    def score(self, phase_metrics: dict) -> dict:
        return scoring.score(phase_metrics)

    def render(self, frames: list, metrics_list: list, phases_dict: dict, phase_metrics: dict) -> dict:
        from analyzer.sports.tennis import rendering

        return rendering.render_all(frames, metrics_list, phases_dict, phase_metrics)


__all__ = ["TennisPlugin"]
```

### Registry (`registry.py`)

Only the `SPORTS` tuple and the import change:

```python
from analyzer.sports.basketball import BasketballPlugin
from analyzer.sports.tennis import TennisPlugin

SPORTS: dict[str, SportPlugin] = {
    p.name: p for p in (BasketballPlugin(), TennisPlugin())
}
```

`get_plugin`, `list_sports`, and `UnknownSport` are unchanged.

## Metrics (`sports/tennis/metrics.py`)

### Landmarks used

From `analyzer.geometry.LANDMARKS` (MediaPipe Pose): `left/right_shoulder`,
`left/right_elbow`, `left/right_wrist`, `left/right_hip`,
`left/right_knee`, `left/right_ankle`, `nose`. Each landmark is
`[x, y, z, visibility]` with `x, y` normalised to `[0, 1]`, `y` growing
downward (top of frame = 0).

### Dominant side

Determined **once per clip**, not per frame — the same clip-wide pattern
as basketball's `shooting_side`. The dominant (racket) arm is the one
whose wrist reaches the highest point (smallest `y`) anywhere in the clip:

```python
def frame_metrics(frames: list) -> list:
    lw = [float(f["left_wrist"][1]) for f in frames if f is not None]
    rw = [float(f["right_wrist"][1]) for f in frames if f is not None]
    if not lw and not rw:
        side = None
    else:
        side = "right" if min(rw, default=1.0) <= min(lw, default=1.0) else "left"
    return [_frame_metrics(f, side) if f is not None else None for f in frames]
```

When `side is None` (no valid frames) the list is all `None` and
`segment` returns the empty result; `_frame_metrics` is never called with
`side is None`.

### Per-frame keys

`_frame_metrics(frame, side)` returns a flat `dict`. `d` = dominant side,
`n` = non-dominant (`"left" if side == "right" else "right"`). All angle
values are degrees; all `*_y` values are normalised image coordinates.

| Key | Definition |
|---|---|
| `dominant_side` | `side` (`"right"` / `"left"`) |
| `hitting_elbow_angle` | `calculate_angle(d_shoulder, d_elbow, d_wrist)` |
| `tossing_arm_angle` | `calculate_angle(n_shoulder, n_elbow, n_wrist)` |
| `knee_angle` | mean of `calculate_angle(hip, knee, ankle)` for left and right |
| `trunk_tilt` | angle between the shoulder-midpoint→hip-midpoint vector and the vertical axis `(0, 1)`, in degrees, always ≥ 0 |
| `shoulder_hip_separation` | `abs(shoulder_line_angle - hip_line_angle)`, where each line angle is `degrees(atan2(right_y - left_y, right_x - left_x))`; result folded to `[0, 90]` |
| `shoulder_tilt` | `abs(left_shoulder_y - right_shoulder_y)` |
| `dominant_arm_elevation` | angle between the `d_shoulder→d_wrist` vector and the vertical axis `(0, -1)` (straight up), in degrees, always ≥ 0 |
| `contact_reach` | `d_wrist_y - nose_y` (negative ⇒ wrist above head) |
| `tossing_wrist_y` | `n_wrist_y` |
| `dominant_wrist_y` | `d_wrist_y` |
| `dominant_shoulder_y` | `d_shoulder_y` |
| `torso_width` | `abs(left_shoulder_x - right_shoulder_x)` |
| `torso_height` | `abs(hip_mid_y - shoulder_mid_y)` |

`calculate_angle` is `analyzer.geometry.calculate_angle` (already used by
basketball, takes 3-D points, returns degrees). `trunk_tilt`,
`shoulder_hip_separation`, and `dominant_arm_elevation` are computed with
2-D `(x, y)` vectors and `numpy` (`atan2` / `arccos`); the implementation
plan gives the exact expressions and their unit tests.

`torso_width` and `torso_height` exist solely so the **shared**
`analyzer.camera.classify_camera_view(metrics)` works unchanged on tennis
metrics — it reads exactly those two keys.

## Segmentation (`sports/tennis/phases.py`)

```python
PHASE_ORDER = ["stance", "toss", "trophy", "cocking", "contact", "follow_through"]
```

`segment(metrics)` follows the same structure as basketball's: collect
`valid = [(i, m) for i, m in enumerate(metrics) if m is not None]`, get
`view, confidence = classify_camera_view(metrics)` from the shared
classifier, and if `len(valid) < 6` return
`{"phases": {k: None for k in PHASE_ORDER}, "camera_view": view,
"confidence": confidence}`.

Otherwise locate anchor frames, in this order:

1. **`contact`** — `argmin` of `dominant_wrist_y` over `valid` (hitting
   hand at its highest).
2. **`toss`** — `argmin` of `tossing_wrist_y` over frames with `i <=
   contact_idx`. If none precede contact, `toss_idx = valid[0][0]`.
3. **`trophy`** — `argmin` of `knee_angle` over frames with `toss_idx <
   i < contact_idx` (deepest leg load between toss peak and contact). If
   that window is empty, `trophy_idx = toss_idx`.
4. **`cocking`** — `argmax` of `trunk_tilt` over frames with `trophy_idx
   < i < contact_idx` (peak trunk lean / "cartwheel"). If that window is
   empty, `cocking_idx = None`.
5. **`stance`** — over frames with `i < toss_idx`, let `max_pre =
   max(knee_angle)`; take the **last** frame whose `knee_angle >= max_pre
   - 15.0` (most upright frame before the toss starts). If no frame
   precedes the toss, `stance_idx = valid[0][0]`.
6. **`follow_through`** — over frames with `i > contact_idx`, take the
   **last** whose `dominant_wrist_y > dominant_shoulder_y` (hitting hand
   has dropped below shoulder). If none qualify but frames follow
   contact, use the last valid index. If no frames follow contact,
   `follow_through_idx = None`.

Truncation rules (a clip that ends at or near contact yields no distinct
later phases), applied after the anchors above:

- if `contact_idx <= trophy_idx` → `contact_idx = None`,
  `follow_through_idx = None`, `cocking_idx = None`
- if `follow_through_idx is not None` and `follow_through_idx <=
  (contact_idx or trophy_idx)` → `follow_through_idx = None`

Return:

```python
{
    "phases": {
        "stance": stance_idx,
        "toss": toss_idx,
        "trophy": trophy_idx,
        "cocking": cocking_idx,
        "contact": contact_idx,
        "follow_through": follow_through_idx,
    },
    "camera_view": view,
    "confidence": confidence,
}
```

Any `None` index is normal: `pipeline._extract_phase_metrics` maps it to
`None`, and `score` renders that phase as `status: "unavailable"` —
exactly as basketball handles a truncated jump shot today.

Camera view: **the shared `classify_camera_view` is reused unchanged.**
Serves are filmed side-on or oblique, which its `torso_width /
torso_height` ratio already classifies. `segment` forwards its result.
No tennis-specific view classifier.

## Scoring & ideals (`sports/tennis/scoring.py`)

`score(phase_metrics)` is a near-copy of basketball's `score` — same
control flow, same output shape. It reuses
`analyzer.scoring_curve.score_metric(value, lo, hi, falloff)` and
iterates `PHASE_ORDER`. Only `IDEALS`, `PHASE_INFO`, `PHASE_RESOURCES`,
and `generate_feedback` carry tennis content.

### Output shape (unchanged from the A schema)

```json
{
  "overall_score": 88.0,
  "priority": "cocking",
  "phases": {
    "<phase_key>": {
      "emoji": "🎾",
      "title": "Trophy Pose",
      "description": "Loaded position just before the drive up",
      "score": 82.4,
      "status": "warning",
      "feedback": "…",
      "resources": [{"label": "…", "url": "…"}],
      "angles_measured": {
        "<metric>": {"value": 118.2, "ideal": "110–140°", "score": 91.0}
      }
    }
  }
}
```

`overall_score` = mean of the per-phase scores (phases with no measurable
metric contribute `0`, as in basketball). `priority` = the phase with the
lowest score. A phase whose metric dict is `None` →
`{"score": 0, "status": "unavailable", "feedback": "Could not detect this
phase — film the whole serve from the side with your full body in
frame.", "resources": [...], "angles_measured": {}}`.

`angles_measured[metric].ideal` is `f"{lo:g}–{hi:g}"` plus `"°"` when
`"angle"`, `"tilt"`, `"elevation"`, or `"separation"` is in the metric
name; `contact_reach` (a normalised-coordinate ratio) is rendered with no
unit, matching the frontend's unit-aware chip logic.

### Phase info

| key | emoji | title | description |
|---|---|---|---|
| `stance` | 🎾 | Stance | Balanced start, weight ready to load |
| `toss` | 🖐️ | Ball Toss | Tossing arm extended, release up and slightly forward |
| `trophy` | 🏆 | Trophy Pose | Loaded legs, hitting arm cocked back |
| `cocking` | 🏹 | Racket Drop | Peak trunk tilt and shoulder–hip separation |
| `contact` | 💥 | Contact | Full extension up to the hitting hand's peak |
| `follow_through` | 🎯 | Follow Through | Deceleration down and across the body |

### Ideal bands

Derived from the widely used 8-stage serve model of Kovacs & Ellenbecker
("An 8-Stage Model for Evaluating the Tennis Serve", *Sports Health*,
2011) and ITF / USTA coaching biomechanics guidance, adapted to what
MediaPipe Pose can measure from a side view and to a recreational-player
target (not tour-level extremes). Each band's rationale is recorded in
the `scoring.py` module docstring with its source. Bands are the tuned
starting point; the implementation plan does not change them without
recording why.

```python
IDEALS = {
    "stance": {
        "knee_angle":        {"lo": 155.0, "hi": 178.0, "falloff": 25.0},
        "trunk_tilt":        {"lo": 0.0,   "hi": 12.0,  "falloff": 15.0},
    },
    "toss": {
        "tossing_arm_angle": {"lo": 155.0, "hi": 180.0, "falloff": 25.0},
        "contact_reach":     {"lo": -0.30, "hi": -0.05, "falloff": 0.15},
    },
    "trophy": {
        "knee_angle":         {"lo": 110.0, "hi": 140.0, "falloff": 25.0},
        "hitting_elbow_angle":{"lo": 80.0,  "hi": 120.0, "falloff": 30.0},
        "shoulder_tilt":      {"lo": 0.03,  "hi": 0.12,  "falloff": 0.10},
    },
    "cocking": {
        "trunk_tilt":              {"lo": 10.0, "hi": 28.0, "falloff": 15.0},
        "shoulder_hip_separation": {"lo": 15.0, "hi": 45.0, "falloff": 25.0},
        "knee_angle":              {"lo": 130.0,"hi": 165.0,"falloff": 25.0},
    },
    "contact": {
        "hitting_elbow_angle":  {"lo": 150.0, "hi": 180.0, "falloff": 25.0},
        "dominant_arm_elevation":{"lo": 0.0,  "hi": 22.0,  "falloff": 20.0},
        "contact_reach":        {"lo": -0.42, "hi": -0.15, "falloff": 0.15},
        "knee_angle":           {"lo": 160.0, "hi": 180.0, "falloff": 20.0},
    },
    "follow_through": {
        "hitting_elbow_angle": {"lo": 30.0, "hi": 90.0, "falloff": 40.0},
    },
}
```

`follow_through` has one deliberately wide band: pose-only deceleration
mechanics are hard to prescribe, so its feedback is mostly confirmatory.

### Feedback

`generate_feedback(phase, metrics) -> (text, status)` with `good` /
`warning` / `error` branches per phase, same style as basketball —
threshold checks on the phase's key metrics, coaching-voice text, one
sentence. Exact branch logic and strings are in the implementation plan.

### Resources

Two links per phase, concrete URLs, all under stable coaching domains
(`usta.com`, `itftennis.com`, and established coaching sites). The
implementation plan includes a step to open each URL and confirm it
resolves before committing; any dead link is swapped for a working one on
the same domain.

## Rendering (`sports/tennis/rendering.py`)

`render_all(frames, metrics, phases, phase_metrics) -> {"pose_gif": str,
"phase_images": {phase_key: {"user_frame": str, "ideal_frame": str}}}` —
the same signature basketball's `render_all` has.

- `pose_gif` and each `user_frame` come from the **shared**
  `analyzer.skeleton.generate_pose_gif` and
  `analyzer.skeleton.extract_phase_frame_b64` — unchanged, sport-neutral.
- `ideal_frame` comes from a tennis `draw_ideal_skeleton(phase, metrics,
  size=(460, 460)) -> np.ndarray`, following the pattern basketball's
  ideal frame now uses:
  - `#11151C` background, `#212D40` header/footer strips, terracotta
    `#D66853` for key joints, muted text for labels.
  - A hand-authored **side-profile** reference pose per phase (six
    entries in an `_IDEAL_PROFILE` dict of normalised joint coordinates:
    `head, shoulder, elbow, wrist, hip, knee, ankle, toe`, plus a
    `toss_wrist` point for `stance`/`toss`/`trophy`), figure facing +x.
  - Header `IDEAL — <title>`; a top-right badge showing `Target <lo>–<hi>`
    for the phase's primary metric and, when `metrics` carries that key,
    `You <value>` coloured green inside the band / terracotta outside.
  - A bottom cue strip with a one-line coaching cue per phase.
- A `None` or all-`None` `phase_metrics[key]` still yields an ideal frame
  (the reference pose is static); the `user_frame` for a `None` phase
  index is `""`, exactly as basketball handles it.

## Data flow

Unchanged from sub-project A — `pipeline.run(frames, plugin)` already
orchestrates everything:

```
video ─> pose.extract_landmarks_from_video ─> frames: list[dict | None]
frames ─> TennisPlugin.frame_metrics ─> metrics: list[dict | None]
metrics ─> TennisPlugin.segment ─> {phases, camera_view, confidence}
metrics + phases ─> pipeline._extract_phase_metrics ─> phase_metrics: {phase_key: dict | None}
phase_metrics ─> TennisPlugin.score ─> {overall_score, priority, phases}
frames + metrics + phases + phase_metrics ─> TennisPlugin.render ─> {pose_gif, phase_images}
                              ─> merge additive keys (sport, motion, phase_order) ─> 200 response
```

## API

No contract change. `POST /analyze` already requires `sport`; posting
`sport=tennis` now succeeds instead of returning
`400 unknown sport 'tennis'`. `GET /sports` gains a second entry:

```json
[
  {"name": "basketball", "display_name": "Basketball", "motion": "jump shot",
   "phase_order": ["ready_position", "load", "set_point", "release", "follow_through"]},
  {"name": "tennis", "display_name": "Tennis", "motion": "serve",
   "phase_order": ["stance", "toss", "trophy", "cocking", "contact", "follow_through"]}
]
```

## Error handling

Entirely covered by existing shared code:

- Unknown/missing `sport` → `400` at the `api.py` boundary (unchanged).
- Fewer than 6 valid pose frames, or a truncated serve → missing phases
  are `None`, scored `"unavailable"`. No exception.
- `_extract_phase_metrics` / `_render_phase_images` already tolerate
  `None` and out-of-range indices.
- Any unexpected exception inside the plugin propagates to `api.py`'s
  generic `500` handler (logged server-side, generic detail to client).

## Testing

All tennis tests run under `pytest -m "not mediapipe"` with no video.

### New synthetic fixture

`tests/synth.py` gains `synth_tennis_serve(n_frames=48) -> list[dict]` —
a deterministic landmark sequence (fixed seed / closed-form
interpolation, no randomness) that sweeps a right-handed serve through all
six phases in order: upright stance → tossing arm rises → knees flex to
trophy with hitting elbow cocked → trunk tilts back at racket drop →
full vertical extension at contact → hitting arm comes down across the
body. Values are chosen so each phase's anchor frame lands where
`segment` should find it and the per-phase metrics sit inside the ideal
bands (a "good" serve). Mirrors the existing basketball synth helpers.

### New test files

- `tests/test_tennis_metrics.py`
  - `frame_metrics` on a synthetic clip: dominant side is `"right"` for
    the right-handed fixture, `"left"` when wrists are mirrored.
  - Every documented key is present; angles are finite and in `[0, 360]`;
    `trunk_tilt`, `shoulder_hip_separation`, `dominant_arm_elevation` are
    ≥ 0; `contact_reach` is negative at the contact frame.
  - `None` frames pass through as `None`; an all-`None` clip yields
    `dominant_side` unreachable (list is all `None`).
  - Closed-form checks for the three new geometry expressions on
    hand-built frames with known answers (vertical arm ⇒ elevation ≈ 0,
    level shoulders ⇒ separation ≈ 0, etc.).

- `tests/test_tennis_plugin.py`
  - `segment(synth_tennis_serve())` returns all six phase indices,
    strictly increasing in `PHASE_ORDER` order, with `camera_view` in
    `{"side", "oblique", "front"}` and `0 <= confidence <= 1`.
  - A clip truncated just after `trophy` → `cocking`, `contact`,
    `follow_through` are `None`; `score` marks them `"unavailable"` and
    still returns a valid `overall_score` / `priority`.
  - A `< 6`-valid-frame clip → every phase `None`.
  - `score` on the full synthetic serve: output has
    `overall_score`, `priority`, and a `phases` dict whose keys are
    exactly `PHASE_ORDER`; each entry has the eight required fields;
    `priority` is a member of `PHASE_ORDER`; the "good" fixture scores
    `overall_score >= 70`.

### Extended existing tests

- `tests/test_core_purity.py` — add
  `analyzer/sports/tennis/metrics.py`, `phases.py`, `scoring.py` to
  `CORE`. `rendering.py` stays exempt (image module).
- `tests/test_plugin_contract.py` — already parametrised over
  `registry.SPORTS`; it must now feed a synthetic frame that both plugins
  accept (a full-landmark frame works for both). Tennis is covered with
  no new assertions if the parametrisation and the shared synthetic frame
  are sufficient; otherwise a tennis branch is added to the fixture.
- `tests/test_sports.py` / `tests/test_registry.py` — `list_sports()` /
  `GET /sports` returns both entries in registry order; `get_plugin(
  "tennis")` returns the `TennisPlugin`; the tennis `phase_order` matches
  `PHASE_ORDER`.
- `tests/test_api.py` — `POST /analyze` with `sport=tennis` and a stub
  pose sequence routes to the tennis plugin (monkeypatch pose extraction
  as the existing basketball `/analyze` test does) and returns
  `sport: "tennis"`, `motion: "serve"`, the tennis `phase_order`.
- `tests/test_rendering_smoke.py` — add a tennis case:
  `TennisPlugin().render(...)` on the synthetic fixture returns a
  `pose_gif` string and a `phase_images` dict keyed by `PHASE_ORDER`,
  each value a `{"user_frame", "ideal_frame"}` pair of strings, with at
  least one non-empty `ideal_frame`.

### Regression safety

Basketball goldens (`tests/golden/*`, `test_no_regression.py`,
`test_pipeline_golden.py`) are **not touched**. Optionally, the
implementation plan may add `tests/golden/tennis_synth.json` captured
from `synth_tennis_serve()` plus a `test_tennis_golden.py` that freezes
the analysis fields (not the base64 media) for future-change safety; this
is a nice-to-have, not required for the plugin to ship.

### CI

`.github/workflows/ci.yml` is unchanged in shape (ruff + `pytest -m "not
mediapipe"` on 3.11); it just runs the larger suite.

## Open questions

None blocking.

- The ideal bands are a literature-informed first cut, not empirically
  fitted (no dataset exists). They are expected to be revised once real
  serve clips can be run through the pipeline; the module docstring is
  the record of current rationale.
- The basketball `sports/tennis/` package-vs-single-file decision is left
  to the implementation plan on a line-count basis, matching how
  basketball was handled.
