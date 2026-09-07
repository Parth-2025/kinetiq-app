# KinetiQ Multi-Sport Architecture — Design Spec

**Status:** Draft for review
**Date:** 2026-09-05
**Scope:** Sub-project A of the multi-sport expansion. Backend only.

## Context

KinetiQ analyses basketball jump-shot form: a video is turned into
per-frame MediaPipe landmarks, then into per-frame joint angles, then
segmented into five shot phases, then each phase is scored against ideal
angle bands and turned into feedback. Every stage after landmark
extraction is basketball-specific and lives at the root of
`backend/analyzer/` (`angles.py`, `phases.py`, `scoring.py`,
`rendering.py`).

We want KinetiQ to analyse **tennis serves** and **running gait** as
well. Those are separate efforts (sub-projects C and D). This spec covers
only the foundation they both need: a sport-agnostic pipeline core plus a
plugin interface, with the existing basketball logic refactored to be the
first plugin.

### Decomposition (for reference — only A is in scope here)

| # | Sub-project | Depends on |
|---|---|---|
| **A** | Multi-sport backend architecture (this spec) | — |
| B | Persistence layer / Firebase replacement | — |
| C | Tennis serve plugin | A |
| D | Running gait plugin | A |
| E | Frontend multi-sport wiring | A, B |

## Goals

1. A sport-agnostic pipeline: landmark extraction, geometry helpers, the
   scoring curve, camera-view classification, and skeleton rendering are
   shared and contain no sport-specific constants.
2. A `SportPlugin` interface that owns everything sport-specific: the
   per-frame metric set, the phase model, the scoring configuration, and
   an optional ideal-pose overlay.
3. Basketball refactored into `sports/basketball/` as the first plugin,
   with its `/analyze` output byte-identical to today except for
   documented additive fields.
4. `/analyze` takes a required `sport` parameter; a `GET /sports`
   endpoint lets clients discover what is analysable.

## Non-Goals

- Tennis or running analysis logic (sub-projects C, D). This spec only
  has to make them possible to add without touching shared code.
- Downloading or processing any external dataset (sub-project D).
- Any frontend change (sub-project E). This spec fixes the new response
  schema that E will consume.
- The Firebase → Postgres persistence replacement (sub-project B).
- Multi-shot segmentation and session/trend tracking (KinetiQ Phase B).

## Global Constraints

- Python 3.11 target (`ruff` `target-version = "py311"`); MediaPipe has no
  3.13 wheels.
- `ruff check .` from `backend/` must stay clean (`select = E,F,I,UP,B`,
  `ignore = E501`, `line-length = 100`, `src = ["."]`).
- Tests run as `cd backend && python -m pytest`, `pythonpath = ["."]`.
- The shared pipeline core and every `sports/**` module import only
  numpy and the standard library — never `fastapi`, `cv2`, `PIL`,
  `mediapipe`, `starlette`. `cv2`/`PIL` are permitted in `skeleton.py`
  and in a plugin's `rendering.py` (image modules), never in `metrics`,
  `phases`, or `scoring`. `test_core_purity.py` enforces this by AST
  scan.
- Basketball `/analyze` output: every field that exists today keeps its
  exact key path, type, and value. Only additive top-level keys are
  allowed (`sport`, `motion`, `phase_order`). The golden regression
  tests enforce this for the analysis fields (`phases`, `camera_view`,
  `confidence`, and every per-phase score/status/feedback/measurement);
  the base64 `pose_gif` and `phase_images` are not in the goldens
  (synthetic fixtures carry no real frames) and are covered instead by
  `test_rendering_smoke.py`.
- All work on a dedicated branch, never `main`.
- Commits attributed to Parth Mohan <parthmohan2006@gmail.com>.

## Current State (what moves where)

| Today | Becomes | Kind |
|---|---|---|
| `analyzer/pose.py` | `analyzer/pose.py` (unchanged) | shared |
| `analyzer/angles.py` → `calculate_angle`, vector math | `analyzer/geometry.py` | shared |
| `analyzer/angles.py` → `frame_angles` (12-key set), `angles_per_frame` | `sports/basketball/metrics.py` → `frame_metrics` | basketball |
| `analyzer/phases.py` → `classify_camera_view` | `analyzer/camera.py` | shared |
| `analyzer/phases.py` → `PHASE_KEYS`, `segment_phases`, `extract_phase_angles`, `extract_phase_indices` | `sports/basketball/phases.py` → `PHASE_ORDER`, `segment`; extraction generalised into `pipeline.py` | basketball / shared |
| `analyzer/scoring.py` → `score_metric` | `analyzer/scoring_curve.py` | shared |
| `analyzer/scoring.py` → `IDEALS`, `PHASE_INFO`, `PHASE_RESOURCES`, `_generate_feedback`, `analyze` | `sports/basketball/scoring.py` → `IDEALS`, `PHASE_INFO`, `PHASE_RESOURCES`, `generate_feedback`, `score` | basketball |
| `analyzer/rendering.py` → `generate_pose_gif`, `draw_skeleton_on_frame`, `SKELETON_CONNECTIONS`, `get_joint_color`, `extract_phase_frame_b64` | `analyzer/skeleton.py` | shared |
| `analyzer/rendering.py` → `draw_ideal_skeleton`, `IDEAL_RANGES`, `render_phase_images` | `sports/basketball/rendering.py` → `render_ideal`; `render_phase_images` generalised into `pipeline.py` | basketball / shared |
| inline body of `api.py::analyze_shot` | `analyzer/pipeline.py::run` | shared |

`analyzer/__init__.py` stops re-exporting basketball symbols; it exports
`get_plugin`, `list_sports`, and `run`.

## Architecture

### Module layout

```
backend/analyzer/
  pose.py            # unchanged — MediaPipe landmark extraction (lazy cv2/mediapipe)
  geometry.py        # calculate_angle + vector helpers            (numpy only)
  scoring_curve.py   # score_metric(value, lo, hi, falloff)         (stdlib only)
  camera.py          # classify_camera_view(metrics) -> (str, float) shared default
  skeleton.py        # generate_pose_gif, draw_skeleton_on_frame,   (cv2/PIL allowed)
                     #   SKELETON_CONNECTIONS, get_joint_color, extract_phase_frame_b64
  registry.py        # SPORTS: dict[str, SportPlugin]; get_plugin(name); list_sports()
  pipeline.py        # run(frames, plugin) -> dict; _extract_phase_metrics; _render_phase_images
  __init__.py        # exports get_plugin, list_sports, run
  sports/
    __init__.py
    base.py          # SportPlugin ABC
    basketball/
      __init__.py    # BasketballPlugin() instance wiring the four modules below
      metrics.py     # frame_metrics(frame) -> dict   (12-key set, numpy only)
      phases.py      # PHASE_ORDER: list[str]; segment(metrics) -> dict
      scoring.py     # IDEALS, PHASE_INFO, PHASE_RESOURCES, generate_feedback, score(phase_metrics)
      rendering.py   # IDEAL_RANGES; render_ideal(phase, metrics, size) -> np.ndarray | None
```

If `sports/basketball/` proves small enough, its four modules may collapse
into a single `sports/basketball.py` — the implementation plan decides
based on line count. The package form is the default.

### The `SportPlugin` interface (`sports/base.py`)

```python
from abc import ABC, abstractmethod


class SportPlugin(ABC):
    name: str            # machine id, lowercase, e.g. "basketball"
    display_name: str    # "Basketball"
    motion: str          # human label for the analysed motion, e.g. "jump shot"
    phase_order: list[str]

    @abstractmethod
    def frame_metrics(self, frame: dict) -> dict:
        """Scalar metrics for ONE landmark frame. The caller passes only
        non-None frames and threads the results back with None gaps."""

    @abstractmethod
    def segment(self, metrics: list[dict | None]) -> dict:
        """-> {"phases": {phase_key: frame_idx | None},
               "camera_view": str, "confidence": float}
        phase_key ranges over self.phase_order. A phase that cannot be
        located is None."""

    @abstractmethod
    def score(self, phase_metrics: dict[str, dict | None]) -> dict:
        """phase_metrics maps every phase_key to that phase's frame
        metrics (or None if the phase was not found).
        -> {"overall_score": float, "priority": str,
            "phases": {phase_key: {emoji, title, description, score,
                                   status, feedback, resources,
                                   angles_measured}}}"""

    def render_ideal(self, phase: str, metrics: dict, size: tuple[int, int]):
        """Optional ideal-pose overlay for a phase. Default: no overlay."""
        return None
```

Plugins call the shared helpers (`geometry.calculate_angle`,
`scoring_curve.score_metric`, `camera.classify_camera_view`) but own
their phase model and scoring config outright. `segment` returns the
camera view so a plugin can override the shared default; basketball just
forwards `camera.classify_camera_view(metrics)`.

### Registry (`registry.py`)

```python
from analyzer.sports.basketball import BasketballPlugin

SPORTS: dict[str, SportPlugin] = {p.name: p for p in (BasketballPlugin(),)}


def get_plugin(name: str) -> SportPlugin:
    try:
        return SPORTS[name]
    except KeyError:
        raise UnknownSport(name, sorted(SPORTS)) from None


def list_sports() -> list[dict]:
    return [
        {"name": p.name, "display_name": p.display_name,
         "motion": p.motion, "phase_order": p.phase_order}
        for p in SPORTS.values()
    ]
```

`UnknownSport` is a small exception carrying the bad name and the
supported list; `api.py` turns it into a 400.

### Pipeline (`pipeline.py`)

```python
def run(frames: list, plugin: SportPlugin) -> dict:
    metrics = [plugin.frame_metrics(f) if f is not None else None for f in frames]
    seg = plugin.segment(metrics)
    phase_metrics = _extract_phase_metrics(metrics, seg["phases"], plugin.phase_order)
    result = plugin.score(phase_metrics)
    result["sport"]       = plugin.name
    result["motion"]      = plugin.motion
    result["phase_order"] = plugin.phase_order
    result["camera_view"] = seg["camera_view"]
    result["confidence"]  = round(seg["confidence"], 4)
    result["pose_gif"]     = skeleton.generate_pose_gif(frames, metrics)
    result["phase_images"] = _render_phase_images(
        frames, metrics, seg["phases"], phase_metrics, plugin
    )
    return result
```

- `_extract_phase_metrics(metrics, phases, phase_order)` — for each key in
  `phase_order`, if `phases[key]` is a valid in-range index with a
  non-None metric row, return that row, else `None`. Generalises today's
  `extract_phase_angles`.
- `_render_phase_images(frames, metrics, phases, phase_metrics, plugin)` —
  for each key in `phase_order`, take the user frame at `phases[key]` and
  the plugin's `render_ideal(key, phase_metrics[key], size)` overlay, and
  base64-encode both via `skeleton.extract_phase_frame_b64`. Generalises
  today's `render_phase_images`. A `None` overlay yields `ideal_frame:
  ""`. Basketball's `BasketballPlugin.render_ideal` is a full port of
  today's `draw_ideal_skeleton` (it returns an image for every basketball
  phase); the `None` default on the ABC is for sports that ship without
  ideal-pose drawing.

`api.py::analyze_shot` keeps the tempfile handling, the
`run_in_threadpool` wrapping, the "no pose" 422 guard, and the generic
500 handler; its middle section becomes
`result = await run_in_threadpool(pipeline.run, frames, plugin)`.

## API

### `POST /analyze`

Multipart form:

| field | type | required | notes |
|---|---|---|---|
| `video` | file | yes | unchanged |
| `sport` | text | **yes** | machine id from `GET /sports` |

Responses:

- `400 {"detail": "sport is required"}` — field missing or empty.
- `400 {"detail": "unknown sport 'x'; supported: basketball"}` — not in
  the registry.
- `422 {"detail": "No pose detected. Ensure your full body is visible."}`
  — unchanged.
- `500 {"detail": "Internal server error"}` — unchanged.
- `200` — the response body below.

This is a breaking change for any current caller that posts only `video`;
sub-project E updates the frontend. No deprecation shim.

### `GET /sports`

```json
[
  {
    "name": "basketball",
    "display_name": "Basketball",
    "motion": "jump shot",
    "phase_order": ["ready_position", "load", "set_point", "release", "follow_through"]
  }
]
```

### `POST /analyze` 200 body

```json
{
  "sport": "basketball",
  "motion": "jump shot",
  "phase_order": ["ready_position", "load", "set_point", "release", "follow_through"],
  "overall_score": 92.9,
  "priority": "release",
  "phases": {
    "<phase_key>": {
      "emoji": "🏀",
      "title": "Ready Position",
      "description": "Starting stance before the shot",
      "score": 91.6,
      "status": "warning",
      "feedback": "…",
      "resources": [{"label": "…", "url": "…"}],
      "angles_measured": {
        "<metric>": {"value": 152.4, "ideal": "160–175°", "score": 74.8}
      }
    }
  },
  "camera_view": "side",
  "confidence": 0.8539,
  "pose_gif": "<base64 gif or ''>",
  "phase_images": {
    "<phase_key>": {"user_frame": "<base64 or ''>", "ideal_frame": "<base64 or ''>"}
  }
}
```

Every key under `overall_score`, `priority`, `phases`, `camera_view`,
`confidence`, `pose_gif`, `phase_images` keeps the exact shape and values
it has today for basketball. `sport`, `motion`, and `phase_order` are the
only additions.

## Data Flow

```
video ──> pose.extract_landmarks_from_video ──> frames: list[dict | None]
frames ──> [plugin.frame_metrics per non-None frame] ──> metrics: list[dict | None]
metrics ─> plugin.segment ──> {phases, camera_view, confidence}
metrics + phases ─> _extract_phase_metrics ──> phase_metrics: {phase_key: dict | None}
phase_metrics ─> plugin.score ──> {overall_score, priority, phases}
frames + metrics ─> skeleton.generate_pose_gif ──> pose_gif
frames + metrics + phases + phase_metrics + plugin ─> _render_phase_images ──> phase_images
                                        ──> merge additive keys ──> 200 response
```

## Error Handling

- Unknown or missing `sport` → `400` at the `api.py` boundary, before any
  file work. `pipeline.run` is never called without a valid plugin.
- A plugin whose `segment` returns fewer valid phases than
  `phase_order` is normal — missing phases are `None`, scored as
  `status: "unavailable"` exactly as basketball handles a truncated clip
  today.
- `_extract_phase_metrics` and `_render_phase_images` tolerate `None`
  indices and out-of-range indices without raising.
- Plugin exceptions propagate to `api.py`'s existing generic `500`
  handler (logged server-side, generic detail to the client).

## Testing

### Regression safety net

`capture_current_golden.py` is re-run so `tests/golden/current_*.json`
carry the three additive keys. `test_no_regression.py` asserts every
pre-existing field matches the frozen `legacy_*.json` baseline and
explicitly allowlists `sport`, `motion`, `phase_order`.
`test_pipeline_golden.py` asserts `run(frames, get_plugin("basketball"))`
reproduces the re-captured goldens. Both stay at 5 fixtures.

### New tests

- `test_registry.py` — `get_plugin("basketball")` returns the plugin;
  unknown name raises `UnknownSport` with the supported list;
  `list_sports()` shape.
- `test_pipeline.py` — `run` orchestration against a minimal in-test fake
  plugin (fixed phase order, trivial metrics/segment/score), no MediaPipe.
  Covers the additive-key merge, `_extract_phase_metrics` None handling,
  and `_render_phase_images` with `render_ideal` returning `None`.
- `test_plugin_contract.py` — a parametrised conformance check over every
  entry in `registry.SPORTS`: `frame_metrics` on a synthetic frame
  returns a flat `dict` of floats/strings; `segment` on a synthetic
  metric list returns the `{phases, camera_view, confidence}` shape with
  `phases` keys ⊆ `phase_order`; `score` returns
  `{overall_score, priority, phases}` with `phases` keys ⊆ `phase_order`.
  Tennis and running plug into this later.
- `test_core_purity.py` — extended `CORE` list:
  `geometry.py`, `scoring_curve.py`, `camera.py`, `pipeline.py`,
  `registry.py`, `sports/base.py`, and every non-`rendering` module under
  `sports/basketball/`. `skeleton.py` and `sports/**/rendering.py` are
  exempt (image modules).
- `test_api.py` — `sport` missing → 400; unknown `sport` → 400;
  `GET /sports` returns the basketball entry; the existing `/analyze`
  success and 422 tests updated to send `sport=basketball`.

### Moved tests

`test_angles.py`, `test_phases.py`, `test_scoring.py` retarget the new
module paths (`geometry`, `sports/basketball/*`, `camera`,
`scoring_curve`) with their assertions unchanged. `test_synth.py`,
`test_pose_smoke.py`, `test_rendering_smoke.py`, `test_settings.py` are
unaffected apart from import paths where a symbol moved.

### CI

`.github/workflows/ci.yml` is unchanged in shape (ruff + `pytest -m "not
mediapipe"` on 3.11); it just runs the larger suite.

## Open Questions

None blocking. The basketball package-vs-single-file decision is left to
the implementation plan on a line-count basis.
