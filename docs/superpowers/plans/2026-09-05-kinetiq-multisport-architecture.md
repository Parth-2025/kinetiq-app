# KinetiQ Multi-Sport Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the basketball-hardcoded analyzer pipeline into a sport-agnostic core plus a `SportPlugin` interface, with basketball refactored to the first plugin and `/analyze` gaining a required `sport` parameter.

**Architecture:** Shared modules (`geometry`, `scoring_curve`, `camera`, `skeleton`, `pipeline`, `registry`) contain no sport-specific constants. Each sport lives under `analyzer/sports/<name>/` and implements a four-method `SportPlugin` ABC (`frame_metrics`, `segment`, `score`, `render`). `api.py` resolves the `sport` form field to a plugin via the registry and calls `pipeline.run(frames, plugin)`. Basketball's analysis output stays byte-identical, enforced by the existing golden regression tests.

**Tech Stack:** Python 3.11, FastAPI, MediaPipe (unchanged), numpy, pytest, ruff.

**Spec:** `docs/superpowers/specs/2026-09-05-kinetiq-multisport-architecture-design.md`

## Global Constraints

- Python 3.11 target (`ruff` `target-version = "py311"`); MediaPipe has no 3.13 wheels.
- `ruff check .` from `backend/` must stay clean: `select = ["E", "F", "I", "UP", "B"]`, `ignore = ["E501"]`, `line-length = 100`, `src = ["."]`.
- Tests run as `cd backend && python -m pytest`; `pythonpath = ["."]`.
- The shared pipeline core and every `sports/**` module except `skeleton.py` and `sports/**/rendering.py` import only `numpy` and the standard library — never `fastapi`, `cv2`, `PIL`, `mediapipe`, `starlette`, `sqlalchemy`. `test_core_purity.py` enforces this by AST scan.
- Basketball `/analyze` analysis output (`phases`, `camera_view`, `confidence`, and every per-phase `score`/`status`/`feedback`/`angles_measured`) stays byte-identical to the pre-refactor output. `tests/golden/current_*.json` regenerate unchanged; `test_no_regression.py` and `test_pipeline_golden.py` are the enforcement. The base64 `pose_gif`/`phase_images` are not in the goldens and are covered by `test_rendering_smoke.py`.
- All work on branch `multisport-architecture`, never `main`.
- Commits attributed to Parth Mohan <parthmohan2006@gmail.com>.

## Deviations from the spec (deliberate, made while planning)

1. **`SportPlugin.frame_metrics` takes the whole clip, not one frame.** The spec's `frame_metrics(self, frame: dict) -> dict` cannot express basketball's shooting-side detection, which picks the arm whose wrist reaches the global highest point *across the entire clip* and then measures every frame on that arm. The interface is `frame_metrics(self, frames: list) -> list[dict | None]` (None passthrough for undetected frames). Running (gait-cycle detection) and tennis (trunk-rotation baseline) are also clip-level, so this is the right shape for all sports.
2. **One `render` method, not `render_ideal`.** The spec's `render_ideal` alone cannot produce `phase_images` (needs the user-skeleton drawing too) or `pose_gif`. All skeleton/GIF output is one plugin method `render(self, frames, metrics, phases, phase_metrics) -> {"pose_gif": str, "phase_images": {phase: {"user_frame": str, "ideal_frame": str}}}` with an ABC default that returns empty strings for every slot. Basketball's implementation is its relocated `generate_pose_gif` + `render_phase_images`, verbatim.
3. **Golden files keep the pre-refactor analysis shape** (`{"phases": <indices>, "camera_view", "confidence", "analysis": {...}}`); they do **not** gain the additive top-level keys. `capture_current_golden.py` drives the plugin's `frame_metrics`/`segment`/`score` directly and rebuilds that shape, so `test_no_regression.py` / `test_pipeline_golden.py` change by import line only. The additive keys (`sport`, `motion`, `phase_order`) are verified in `test_api.py`.

---

## File Structure

### Shared core (`backend/analyzer/`)

| File | Responsibility | cv2/PIL? |
|---|---|---|
| `pose.py` | MediaPipe landmark extraction | unchanged (lazy imports) |
| `geometry.py` | `calculate_angle`, `LANDMARKS` index map | no — numpy only |
| `scoring_curve.py` | `score_metric` piecewise curve | no — stdlib only |
| `camera.py` | `classify_camera_view` shared default | no — numpy only |
| `skeleton.py` | `SKELETON_CONNECTIONS`, `get_joint_color` drawing constants/helpers | no — stdlib only |
| `registry.py` | `SPORTS`, `get_plugin`, `list_sports`, `UnknownSport` | no |
| `pipeline.py` | `run(frames, plugin)`, `_extract_phase_metrics` | no |
| `__init__.py` | re-exports `run`, `get_plugin`, `list_sports`, `UnknownSport` | no |
| `sports/base.py` | `SportPlugin` ABC | no |
| `sports/basketball/metrics.py` | `frame_metrics(frames)` — was `angles_per_frame` + `frame_angles` | no — numpy only |
| `sports/basketball/phases.py` | `PHASE_ORDER`, `segment(metrics)` — was `segment_phases` | no — numpy only |
| `sports/basketball/scoring.py` | `IDEALS`, `PHASE_INFO`, `PHASE_RESOURCES`, `generate_feedback`, `score` — was `scoring.py` minus `score_metric` | no — stdlib only |
| `sports/basketball/rendering.py` | `IDEAL_RANGES`, `draw_skeleton_on_frame`, `draw_ideal_skeleton`, `generate_pose_gif`, `extract_phase_frame_b64`, `render_phase_images`, `render_all` | yes — cv2 + PIL |
| `sports/basketball/__init__.py` | `BasketballPlugin` | no |

### Deleted at the end (Task 6)

`analyzer/angles.py`, `analyzer/phases.py`, `analyzer/scoring.py`, `analyzer/rendering.py` — every symbol has moved.

---

## Task 1: Shared pure primitives

**Files:**
- Create: `backend/analyzer/geometry.py`
- Create: `backend/analyzer/scoring_curve.py`
- Create: `backend/analyzer/camera.py`
- Create: `backend/analyzer/skeleton.py`
- Modify: `backend/tests/test_core_purity.py`
- Modify: `backend/tests/test_synth.py` (import line only)
- Test: `backend/tests/test_geometry.py`, `backend/tests/test_scoring_curve.py`, `backend/tests/test_camera.py`

**Interfaces:**
- Produces:
  - `geometry.calculate_angle(a, b, c) -> float`; `geometry.LANDMARKS: dict[str, int]`
  - `scoring_curve.score_metric(value: float, lo: float, hi: float, falloff: float) -> float`
  - `camera.classify_camera_view(metrics: list[dict | None]) -> tuple[str, float]`
  - `skeleton.SKELETON_CONNECTIONS: list[tuple[str, str]]`; `skeleton.get_joint_color(angle: float, ideal_low: float, ideal_high: float) -> tuple[int, int, int]`
- Consumes: nothing (leaf modules).

- [ ] **Step 1: Write `backend/analyzer/geometry.py`**

```python
import numpy as np

LANDMARKS = {
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
    "left_heel": 29, "right_heel": 30,
    "left_foot": 31, "right_foot": 32,
    "nose": 0, "left_eye": 2, "right_eye": 5, "left_ear": 7, "right_ear": 8,
}


def calculate_angle(a, b, c) -> float:
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    c = np.asarray(c, dtype=float)
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))
```

- [ ] **Step 2: Write `backend/analyzer/scoring_curve.py`**

```python
def score_metric(value: float, lo: float, hi: float, falloff: float) -> float:
    if lo <= value <= hi:
        return 100.0
    dist = min(abs(value - lo), abs(value - hi))
    return max(0.0, round(100.0 * (1.0 - dist / falloff), 1))
```

- [ ] **Step 3: Write `backend/analyzer/camera.py`**

```python
import numpy as np


def _valid(metrics: list) -> list:
    return [(i, m) for i, m in enumerate(metrics) if m is not None]


def classify_camera_view(metrics: list) -> tuple[str, float]:
    ratios = []
    for _, m in _valid(metrics):
        h = m.get("torso_height", 0.0)
        if h > 1e-6:
            ratios.append(m.get("torso_width", 0.0) / h)
    if not ratios:
        return "oblique", 0.2
    ratio = float(np.median(ratios))
    if ratio < 0.55:
        return "side", float(min(1.0, 0.5 + (0.55 - ratio)))
    if ratio > 0.9:
        return "front", float(max(0.0, 0.4 - (ratio - 0.9)))
    return "oblique", 0.4
```

- [ ] **Step 4: Write `backend/analyzer/skeleton.py`**

```python
SKELETON_CONNECTIONS = [
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("left_ankle", "left_foot"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
    ("right_ankle", "right_foot"),
    ("nose", "left_shoulder"),
    ("nose", "right_shoulder"),
]


def get_joint_color(angle: float, ideal_low: float, ideal_high: float) -> tuple[int, int, int]:
    if ideal_low <= angle <= ideal_high:
        return (0, 220, 0)
    deviation = min(abs(angle - ideal_low), abs(angle - ideal_high))
    if deviation < 20:
        return (0, 200, 255)
    return (0, 0, 255)
```

- [ ] **Step 5: Write `backend/tests/test_geometry.py`**

```python
from analyzer.geometry import LANDMARKS, calculate_angle


def test_calculate_angle_right_angle():
    assert abs(calculate_angle([0.0, 1.0, 0.0], [0.0, 0.0, 0.0], [1.0, 0.0, 0.0]) - 90.0) < 1e-6


def test_calculate_angle_straight_line():
    assert abs(calculate_angle([0, 2, 0], [0, 1, 0], [0, 0, 0]) - 180.0) < 0.1


def test_landmarks_has_expected_indices():
    assert LANDMARKS["left_shoulder"] == 11
    assert LANDMARKS["nose"] == 0
    assert len(LANDMARKS) == 21
```

- [ ] **Step 6: Write `backend/tests/test_scoring_curve.py`**

```python
from analyzer.scoring_curve import score_metric


def test_inside_band_is_100():
    assert score_metric(95.0, 85.0, 100.0, 30.0) == 100.0
    assert score_metric(85.0, 85.0, 100.0, 30.0) == 100.0
    assert score_metric(100.0, 85.0, 100.0, 30.0) == 100.0


def test_linear_falloff():
    assert score_metric(115.0, 85.0, 100.0, 30.0) == 50.0
    assert score_metric(70.0, 85.0, 100.0, 30.0) == 50.0
    assert score_metric(55.0, 85.0, 100.0, 30.0) == 0.0
    assert score_metric(40.0, 85.0, 100.0, 30.0) == 0.0


def test_tilt_falloff_is_tight():
    assert score_metric(0.08, 0.0, 0.04, 0.08) == 50.0
```

- [ ] **Step 7: Write `backend/tests/test_camera.py`**

```python
from analyzer.camera import classify_camera_view


def _m(width, height):
    return {"torso_width": width, "torso_height": height}


def test_side_view_low_ratio():
    view, conf = classify_camera_view([_m(0.05, 0.26)] * 10)
    assert view == "side"
    assert conf > 0.5


def test_front_view_high_ratio():
    view, conf = classify_camera_view([_m(0.26, 0.26)] * 10)
    assert view == "front"
    assert conf <= 0.4


def test_no_valid_metrics_returns_oblique_low_conf():
    view, conf = classify_camera_view([None, None])
    assert view == "oblique"
    assert conf == 0.2
```

- [ ] **Step 8: Update `backend/tests/test_core_purity.py`**

Replace line 6 (`CORE = ["angles.py", "phases.py", "scoring.py"]`) with:

```python
CORE = [
    "geometry.py",
    "scoring_curve.py",
    "camera.py",
    "skeleton.py",
    # legacy modules still present until Task 6 — keep asserting they stay pure
    "angles.py",
    "phases.py",
    "scoring.py",
]
```

- [ ] **Step 9: Update `backend/tests/test_synth.py` import**

Change line 2 from `from analyzer.angles import calculate_angle  # created in Task 4; see note below` to `from analyzer.geometry import calculate_angle`.

- [ ] **Step 10: Run the tests**

Run: `cd backend && python -m pytest tests/test_geometry.py tests/test_scoring_curve.py tests/test_camera.py tests/test_core_purity.py tests/test_synth.py -v`
Expected: all pass.

Run: `cd backend && python -m pytest -m "not mediapipe" -q`
Expected: full suite green (old modules untouched, new ones additive).

Run: `cd backend && python -m ruff check .`
Expected: `All checks passed!`

- [ ] **Step 11: Commit**

```bash
git add backend/analyzer/geometry.py backend/analyzer/scoring_curve.py \
        backend/analyzer/camera.py backend/analyzer/skeleton.py \
        backend/tests/test_geometry.py backend/tests/test_scoring_curve.py \
        backend/tests/test_camera.py backend/tests/test_core_purity.py \
        backend/tests/test_synth.py
git commit -m "refactor(backend): extract sport-agnostic geometry/scoring-curve/camera/skeleton primitives"
```

---

## Task 2: `SportPlugin` ABC

**Files:**
- Create: `backend/analyzer/sports/__init__.py` (empty)
- Create: `backend/analyzer/sports/base.py`
- Test: `backend/tests/test_base.py`

**Interfaces:**
- Produces: `sports.base.SportPlugin` — abstract base with class attributes `name: str`, `display_name: str`, `motion: str`, `phase_order: list[str]`; abstract methods `frame_metrics(self, frames: list) -> list`, `segment(self, metrics: list) -> dict`, `score(self, phase_metrics: dict) -> dict`; concrete default `render(self, frames: list, metrics: list, phases: dict, phase_metrics: dict) -> dict`.
- Consumes: nothing.

- [ ] **Step 1: Write `backend/analyzer/sports/__init__.py`**

Empty file.

- [ ] **Step 2: Write failing `backend/tests/test_base.py`**

```python
import pytest

from analyzer.sports.base import SportPlugin


class _Dummy(SportPlugin):
    name = "dummy"
    display_name = "Dummy"
    motion = "wiggle"
    phase_order = ["a", "b"]

    def frame_metrics(self, frames):
        return [None for _ in frames]

    def segment(self, metrics):
        return {"phases": {"a": None, "b": None}, "camera_view": "oblique", "confidence": 0.2}

    def score(self, phase_metrics):
        return {"overall_score": 0, "priority": "a", "phases": {}}


def test_cannot_instantiate_abstract():
    with pytest.raises(TypeError):
        SportPlugin()


def test_concrete_subclass_works_and_render_defaults_empty():
    p = _Dummy()
    out = p.render([], [], {}, {})
    assert out["pose_gif"] == ""
    assert out["phase_images"] == {
        "a": {"user_frame": "", "ideal_frame": ""},
        "b": {"user_frame": "", "ideal_frame": ""},
    }
```

- [ ] **Step 3: Run — expect failure**

Run: `cd backend && python -m pytest tests/test_base.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'analyzer.sports.base'`.

- [ ] **Step 4: Write `backend/analyzer/sports/base.py`**

```python
from abc import ABC, abstractmethod


class SportPlugin(ABC):
    """One analysable sport. Subclasses set the four class attributes and
    implement the three abstract methods; `render` has a no-overlay default."""

    name: str
    display_name: str
    motion: str
    phase_order: list[str]

    @abstractmethod
    def frame_metrics(self, frames: list) -> list:
        """Whole-clip pass: one metric dict per non-None input frame, None
        passthrough for frames with no pose."""

    @abstractmethod
    def segment(self, metrics: list) -> dict:
        """-> {"phases": {phase_key: frame_idx | None},
               "camera_view": str, "confidence": float}
        phase_key ranges over self.phase_order."""

    @abstractmethod
    def score(self, phase_metrics: dict) -> dict:
        """phase_metrics maps every phase_key to that phase's metric dict
        (or None). -> {"overall_score": float, "priority": str,
        "phases": {phase_key: {...}}}"""

    def render(self, frames: list, metrics: list, phases: dict, phase_metrics: dict) -> dict:
        """-> {"pose_gif": str, "phase_images": {phase_key: {"user_frame": str,
        "ideal_frame": str}}}. Default: empty strings for every slot."""
        return {
            "pose_gif": "",
            "phase_images": {
                p: {"user_frame": "", "ideal_frame": ""} for p in self.phase_order
            },
        }
```

- [ ] **Step 5: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_base.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/analyzer/sports/__init__.py backend/analyzer/sports/base.py backend/tests/test_base.py
git commit -m "feat(backend): SportPlugin ABC (frame_metrics/segment/score/render)"
```

---

## Task 3: Basketball plugin

**Files:**
- Create: `backend/analyzer/sports/basketball/__init__.py`
- Create: `backend/analyzer/sports/basketball/metrics.py`
- Create: `backend/analyzer/sports/basketball/phases.py`
- Create: `backend/analyzer/sports/basketball/scoring.py`
- Create: `backend/analyzer/sports/basketball/rendering.py`
- Modify: `backend/tests/test_phases.py`, `backend/tests/test_scoring.py`, `backend/tests/test_angles.py`, `backend/tests/test_rendering_smoke.py` (import lines + symbol renames)
- Test: `backend/tests/test_basketball_plugin.py`

**Interfaces:**
- Consumes: `analyzer.geometry.calculate_angle`; `analyzer.scoring_curve.score_metric`; `analyzer.camera.classify_camera_view`; `analyzer.skeleton.{SKELETON_CONNECTIONS, get_joint_color}`; `analyzer.geometry.LANDMARKS`; `analyzer.sports.base.SportPlugin`.
- Produces:
  - `sports.basketball.metrics.frame_metrics(frames: list) -> list[dict | None]`
  - `sports.basketball.phases.PHASE_ORDER: list[str]` (`["ready_position", "load", "set_point", "release", "follow_through"]`); `sports.basketball.phases.segment(metrics: list) -> dict`
  - `sports.basketball.scoring.IDEALS`, `PHASE_INFO`, `PHASE_RESOURCES`, `generate_feedback(phase, angles) -> tuple[str, str]`, `score(phase_metrics: dict) -> dict`
  - `sports.basketball.rendering.render_all(frames, metrics, phases, phase_metrics) -> dict`
  - `sports.basketball.BasketballPlugin` (concrete `SportPlugin`, `name="basketball"`, `display_name="Basketball"`, `motion="jump shot"`)

- [ ] **Step 1: Write `backend/analyzer/sports/basketball/metrics.py`**

This is the current `analyzer/angles.py` with `calculate_angle`/`LANDMARKS` imported from `analyzer.geometry` and `angles_per_frame` renamed to `frame_metrics`. Copy verbatim:

```python
from analyzer.geometry import calculate_angle


def _frame_angles(frame: dict, side: str | None = None) -> dict:
    if side is None:
        lw_y = float(frame["left_wrist"][1])
        rw_y = float(frame["right_wrist"][1])
        side = "right" if rw_y < lw_y else "left"
    opp = "left" if side == "right" else "right"

    sh_mid_y = (float(frame["left_shoulder"][1]) + float(frame["right_shoulder"][1])) / 2.0
    hip_mid_y = (float(frame["left_hip"][1]) + float(frame["right_hip"][1])) / 2.0

    return {
        "shooting_side": side,
        "elbow_angle": calculate_angle(
            frame[f"{side}_shoulder"][:3], frame[f"{side}_elbow"][:3], frame[f"{side}_wrist"][:3]
        ),
        "knee_angle": calculate_angle(
            frame[f"{side}_hip"][:3], frame[f"{side}_knee"][:3], frame[f"{side}_ankle"][:3]
        ),
        "hip_angle": calculate_angle(
            frame[f"{side}_shoulder"][:3], frame[f"{side}_hip"][:3], frame[f"{side}_knee"][:3]
        ),
        "guide_elbow_angle": calculate_angle(
            frame[f"{opp}_shoulder"][:3], frame[f"{opp}_elbow"][:3], frame[f"{opp}_wrist"][:3]
        ),
        "shoulder_tilt": abs(float(frame["left_shoulder"][1]) - float(frame["right_shoulder"][1])),
        "hip_tilt": abs(float(frame["left_hip"][1]) - float(frame["right_hip"][1])),
        "shooting_wrist_y": float(frame[f"{side}_wrist"][1]),
        "shooting_elbow_y": float(frame[f"{side}_elbow"][1]),
        "shooting_shoulder_y": float(frame[f"{side}_shoulder"][1]),
        "torso_width": abs(float(frame["left_shoulder"][0]) - float(frame["right_shoulder"][0])),
        "torso_height": abs(hip_mid_y - sh_mid_y),
    }


def frame_metrics(frames: list) -> list:
    lw = [float(f["left_wrist"][1]) for f in frames if f is not None]
    rw = [float(f["right_wrist"][1]) for f in frames if f is not None]
    if not lw and not rw:
        side = None
    else:
        side = "right" if min(rw, default=1.0) <= min(lw, default=1.0) else "left"
    return [_frame_angles(f, side=side) if f is not None else None for f in frames]
```

- [ ] **Step 2: Write `backend/analyzer/sports/basketball/phases.py`**

Current `analyzer/phases.py` minus `classify_camera_view` (now imported from `analyzer.camera`), `PHASE_KEYS` renamed `PHASE_ORDER`, `segment_phases` renamed `segment`, `extract_phase_indices`/`extract_phase_angles` dropped (moved to `pipeline._extract_phase_metrics`). Copy verbatim:

```python
from analyzer.camera import classify_camera_view

PHASE_ORDER = ["ready_position", "load", "set_point", "release", "follow_through"]


def _valid(metrics: list) -> list:
    return [(i, a) for i, a in enumerate(metrics) if a is not None]


def segment(metrics: list) -> dict:
    valid = _valid(metrics)
    view, confidence = classify_camera_view(metrics)
    none_phases = {k: None for k in PHASE_ORDER}

    if len(valid) < 5:
        return {"phases": none_phases, "camera_view": view, "confidence": confidence}

    set_idx = min(valid, key=lambda x: x[1]["shooting_wrist_y"])[0]

    before = [(i, a) for i, a in valid if i <= set_idx]
    load_idx = min(before, key=lambda x: x[1]["knee_angle"])[0] if before else valid[0][0]

    pre_load = [(i, a) for i, a in valid if i < load_idx]
    if pre_load:
        max_knee = max(a["knee_angle"] for _, a in pre_load)
        upright = [i for i, a in pre_load if a["knee_angle"] >= max_knee - 15.0]
        ready_idx = upright[-1] if upright else pre_load[0][0]
    else:
        ready_idx = valid[0][0]

    after = [(i, a) for i, a in valid if i > set_idx]
    if len(after) >= 2:
        best_vel = None
        release_idx = after[-1][0]
        for k in range(1, len(after)):
            gap = after[k][0] - after[k - 1][0]
            d_elbow = after[k][1]["elbow_angle"] - after[k - 1][1]["elbow_angle"]
            vel = d_elbow / gap if gap else d_elbow
            if best_vel is None or vel > best_vel:
                best_vel = vel
                release_idx = after[k][0]
    elif after:
        release_idx = after[-1][0]
    else:
        release_idx = set_idx

    post = [(i, a) for i, a in valid if i > release_idx]
    above_shoulder = [
        i for i, a in post if a["shooting_wrist_y"] < a.get("shooting_shoulder_y", 1.0)
    ]
    if above_shoulder:
        follow_idx = above_shoulder[-1]
    elif post:
        follow_idx = post[-1][0]
    else:
        follow_idx = valid[-1][0]

    # a truncated clip that ends at/near set point yields no distinct release/follow-through
    if release_idx <= set_idx:
        release_idx = None
    if release_idx is None or follow_idx <= (release_idx or set_idx):
        follow_idx = None

    return {
        "phases": {
            "ready_position": ready_idx,
            "load": load_idx,
            "set_point": set_idx,
            "release": release_idx,
            "follow_through": follow_idx,
        },
        "camera_view": view,
        "confidence": confidence,
    }
```

- [ ] **Step 3: Write `backend/analyzer/sports/basketball/scoring.py`**

Current `analyzer/scoring.py` minus `score_metric` (imported from `analyzer.scoring_curve`), `_generate_feedback` renamed `generate_feedback`, `analyze` renamed `score` and iterating `PHASE_ORDER`. Copy the `IDEALS`, `PHASE_INFO`, `PHASE_RESOURCES` blocks **verbatim** from `analyzer/scoring.py:1-56`, then:

```python
from analyzer.scoring_curve import score_metric
from analyzer.sports.basketball.phases import PHASE_ORDER

# IDEALS, PHASE_INFO, PHASE_RESOURCES: copied verbatim from analyzer/scoring.py lines 1-56


def generate_feedback(phase: str, angles: dict) -> tuple[str, str]:
    # body copied verbatim from analyzer/scoring.py _generate_feedback (lines 67-121)
    ...


def score(phase_angles: dict) -> dict:
    results: dict[str, dict] = {}
    all_scores: list[float] = []

    for phase in PHASE_ORDER:
        angles = phase_angles.get(phase)
        info = PHASE_INFO[phase]
        resources = PHASE_RESOURCES[phase]

        if angles is None:
            results[phase] = {
                **info,
                "score": 0,
                "status": "unavailable",
                "feedback": "Could not detect this phase — ensure your full body is visible throughout the shot.",
                "resources": resources,
                "angles_measured": {},
            }
            continue

        phase_scores: list[float] = []
        angles_measured: dict[str, dict] = {}
        for metric, band in IDEALS[phase].items():
            val = angles.get(metric)
            if val is None:
                continue
            s = score_metric(val, band["lo"], band["hi"], band["falloff"])
            phase_scores.append(s)
            angles_measured[metric] = {
                "value": round(val, 1),
                "ideal": f"{band['lo']:g}–{band['hi']:g}" + ("°" if "angle" in metric else ""),
                "score": s,
            }

        phase_score = round(sum(phase_scores) / len(phase_scores), 1) if phase_scores else 0
        all_scores.append(phase_score)
        feedback_text, status = generate_feedback(phase, angles)
        results[phase] = {
            **info,
            "score": phase_score,
            "status": status,
            "feedback": feedback_text,
            "resources": resources,
            "angles_measured": angles_measured,
        }

    overall = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0
    priority = min(results.items(), key=lambda kv: kv[1].get("score", 100))[0]
    return {"overall_score": overall, "priority": priority, "phases": results}
```

The `generate_feedback` body is `analyzer/scoring.py` lines 67-121 with only the function name changed on line 66 (`_generate_feedback` → `generate_feedback`); every branch, string, and `IDEALS[...]` reference stays identical. Copy it character-for-character.

- [ ] **Step 4: Write `backend/analyzer/sports/basketball/rendering.py`**

Move `analyzer/rendering.py` here **verbatim** with exactly these edits:
- Delete the local `LANDMARKS` block (lines 16-28) and `SKELETON_CONNECTIONS` block (lines 30-47) and `get_joint_color` (lines 57-63).
- Add at the top of the imports: `from analyzer.geometry import LANDMARKS` and `from analyzer.skeleton import SKELETON_CONNECTIONS, get_joint_color`.
- Keep `IDEAL_RANGES`, `draw_skeleton_on_frame`, `draw_ideal_skeleton`, `generate_pose_gif`, `extract_phase_frame_b64`, the `_PHASES` constant, and `render_phase_images` exactly as they are (lines 49-315), including the module docstring.
- Append one wrapper:

```python
def render_all(frames: list, metrics: list, phases: dict, phase_metrics: dict) -> dict:
    return {
        "pose_gif": generate_pose_gif(frames, metrics),
        "phase_images": render_phase_images(frames, metrics, phases, phase_metrics),
    }
```

Keep the module-top `import base64`, `import io`, `import cv2`, `import numpy as np`, `from PIL import Image`.

- [ ] **Step 5: Write `backend/analyzer/sports/basketball/__init__.py`**

```python
from analyzer.sports.base import SportPlugin
from analyzer.sports.basketball import metrics, phases, rendering, scoring


class BasketballPlugin(SportPlugin):
    name = "basketball"
    display_name = "Basketball"
    motion = "jump shot"
    phase_order = phases.PHASE_ORDER

    def frame_metrics(self, frames: list) -> list:
        return metrics.frame_metrics(frames)

    def segment(self, metrics_list: list) -> dict:
        return phases.segment(metrics_list)

    def score(self, phase_metrics: dict) -> dict:
        return scoring.score(phase_metrics)

    def render(self, frames: list, metrics_list: list, phases_dict: dict, phase_metrics: dict) -> dict:
        return rendering.render_all(frames, metrics_list, phases_dict, phase_metrics)


__all__ = ["BasketballPlugin"]
```

- [ ] **Step 6: Write `backend/tests/test_basketball_plugin.py`**

```python
import numpy as np

from analyzer.sports.basketball import BasketballPlugin
from tests.conftest import load_fixture


def _extract(metrics, phases, order):
    out = {}
    for p in order:
        idx = phases.get(p)
        out[p] = metrics[idx] if idx is not None and metrics[idx] is not None else None
    return out


def test_identity_attributes():
    p = BasketballPlugin()
    assert p.name == "basketball"
    assert p.display_name == "Basketball"
    assert p.motion == "jump shot"
    assert p.phase_order == ["ready_position", "load", "set_point", "release", "follow_through"]


def test_frame_metrics_whole_clip_none_passthrough():
    p = BasketballPlugin()
    frames = load_fixture("truncated")
    m = p.frame_metrics(frames)
    assert len(m) == len(frames)
    assert any(isinstance(x, dict) for x in m)


def test_segment_then_score_shape():
    p = BasketballPlugin()
    m = p.frame_metrics(load_fixture("good_form_side"))
    seg = p.segment(m)
    assert set(seg["phases"]) == set(p.phase_order)
    assert seg["camera_view"] == "side"
    result = p.score(_extract(m, seg["phases"], p.phase_order))
    assert set(result) == {"overall_score", "priority", "phases"}
    assert set(result["phases"]) == set(p.phase_order)


def test_render_default_not_used_basketball_returns_image_dict():
    p = BasketballPlugin()
    frames = load_fixture("good_form_side")
    # synth fixtures carry no real _frame/_raw_landmarks -> user frames are "",
    # ideal frames are still drawn
    for f in frames:
        if f is not None:
            f["_frame"] = np.zeros((100, 100, 3), dtype=np.uint8)
            f["_raw_landmarks"] = None
    m = p.frame_metrics(frames)
    seg = p.segment(m)
    rendered = p.render(frames, m, seg["phases"], _extract(m, seg["phases"], p.phase_order))
    assert set(rendered) == {"pose_gif", "phase_images"}
    assert set(rendered["phase_images"]) == set(p.phase_order)
    for pair in rendered["phase_images"].values():
        assert set(pair) == {"user_frame", "ideal_frame"}
```

- [ ] **Step 7: Repoint `backend/tests/test_phases.py`**

Replace the import block (lines 1-9) with:

```python
from analyzer.sports.basketball import BasketballPlugin
from analyzer.sports.basketball.phases import PHASE_ORDER, segment
from analyzer.camera import classify_camera_view
from tests import synth
from tests.conftest import load_fixture

_PLUGIN = BasketballPlugin()


def _metrics(name):
    return _PLUGIN.frame_metrics(load_fixture(name))
```

Then, throughout the file:
- `PHASE_KEYS` → `PHASE_ORDER`
- `angles_per_frame(load_fixture(name))` → `_metrics(name)`
- `angles_per_frame(load_fixture("..."))` inside a `segment_phases(...)` call → `_metrics("...")`
- `segment_phases(` → `segment(`
- the helper `_seg(name)` becomes `return segment(_metrics(name))`
- `extract_phase_angles(frames, seg["phases"])` (in `test_extract_phase_angles_shape` and `test_release_taken_on_shooting_arm_not_guide_flip`) → a local extract: add this helper near the top and use it:

```python
def _phase_metrics(metrics, phases):
    out = {}
    for p in PHASE_ORDER:
        idx = phases.get(p)
        out[p] = metrics[idx] if idx is not None and metrics[idx] is not None else None
    return out
```

- in `test_release_taken_on_shooting_arm_not_guide_flip`, delete the inner `from analyzer.angles ...` / `from analyzer.phases ...` / `from tests.conftest ...` imports (lines 70-72) and use the module-level helpers: `al = _metrics("elbow_flare_side")`, `seg = segment(al)`, `pa = _phase_metrics(al, seg["phases"])`.
- `test_degenerate_short_clip_all_none`: `segment_phases(angles_per_frame(synth.make_shot(n_frames=4)))` → `segment(_PLUGIN.frame_metrics(synth.make_shot(n_frames=4)))`.
- `test_camera_view_side_vs_front` / `test_no_pose_returns_all_none_and_oblique`: `angles_per_frame(load_fixture(...))` → `_metrics(...)`.

- [ ] **Step 8: Repoint `backend/tests/test_scoring.py`**

Replace lines 1-4 with:

```python
from analyzer.sports.basketball import BasketballPlugin
from analyzer.sports.basketball.phases import PHASE_ORDER
from analyzer.sports.basketball.scoring import IDEALS, PHASE_INFO, score
from analyzer.scoring_curve import score_metric
from tests.conftest import load_fixture

_PLUGIN = BasketballPlugin()


def _analyze(name):
    m = _PLUGIN.frame_metrics(load_fixture(name))
    seg = _PLUGIN.segment(m)
    phase_metrics = {}
    for p in PHASE_ORDER:
        idx = seg["phases"].get(p)
        phase_metrics[p] = m[idx] if idx is not None and m[idx] is not None else None
    return score(phase_metrics)
```

Then: every call `analyze(` → `score(` in the test bodies (`test_analyze_shape_matches_legacy_contract` and `test_missing_phase_scores_zero_unavailable` both call `analyze({...})` / `analyze({k: None ...})` → `score(...)`). Rename `test_analyze_shape_matches_legacy_contract` stays as-is otherwise.

- [ ] **Step 9: Repoint `backend/tests/test_angles.py`**

Rename the file to `backend/tests/test_basketball_metrics.py` (`git mv`). Replace lines 1-5 with:

```python
import pytest

from analyzer.geometry import calculate_angle
from analyzer.sports.basketball.metrics import _frame_angles, frame_metrics
from tests import synth
from tests.conftest import FIXTURE_NAMES, load_fixture
```

Then in the bodies: `frame_angles(` → `_frame_angles(`; `angles_per_frame(` → `frame_metrics(`. The `calculate_angle` tests stay. `test_frame_angles_keys` → keep name, still asserts the 12-key set. `test_angles_per_frame_passes_none_through` → rename to `test_frame_metrics_passes_none_through`.

- [ ] **Step 10: Repoint `backend/tests/test_rendering_smoke.py`**

Replace lines 3-5 with:

```python
from analyzer.sports.basketball import BasketballPlugin
from analyzer.sports.basketball.rendering import generate_pose_gif, render_phase_images
from tests import synth

_PLUGIN = BasketballPlugin()
```

Then: `angles_per_frame(frames)` → `_PLUGIN.frame_metrics(frames)`; `segment_phases(al)` → `_PLUGIN.segment(al)`; `extract_phase_angles(al, seg["phases"])` → build inline:

```python
def _pm(metrics, phases):
    order = ["ready_position", "load", "set_point", "release", "follow_through"]
    return {p: (metrics[phases[p]] if phases.get(p) is not None else None) for p in order}
```

- [ ] **Step 11: Run all repointed + new tests**

Run: `cd backend && python -m pytest tests/test_basketball_plugin.py tests/test_phases.py tests/test_scoring.py tests/test_basketball_metrics.py tests/test_rendering_smoke.py -v`
Expected: all pass, same assertion outcomes as before the move.

Run: `cd backend && python -m pytest -m "not mediapipe" -q`
Expected: full suite green. (`capture_current_golden.py`, `test_no_regression.py`, `test_pipeline_golden.py`, `api.py`, `analyzer/__init__.py` still use the old `analyzer/angles.py` etc., which are still present — untouched.)

Run: `cd backend && python -m ruff check .`
Expected: `All checks passed!`

- [ ] **Step 12: Commit**

```bash
git add backend/analyzer/sports/basketball/ backend/tests/test_basketball_plugin.py \
        backend/tests/test_phases.py backend/tests/test_scoring.py \
        backend/tests/test_basketball_metrics.py backend/tests/test_rendering_smoke.py
git add -u backend/tests   # picks up the test_angles.py -> test_basketball_metrics.py rename
git commit -m "refactor(backend): basketball becomes the first SportPlugin under sports/basketball/"
```

---

## Task 4: Registry, pipeline, package exports

**Files:**
- Create: `backend/analyzer/registry.py`
- Create: `backend/analyzer/pipeline.py`
- Modify: `backend/analyzer/__init__.py`
- Modify: `backend/tests/test_core_purity.py`
- Test: `backend/tests/test_registry.py`, `backend/tests/test_pipeline.py`, `backend/tests/test_plugin_contract.py`

**Interfaces:**
- Consumes: `analyzer.sports.base.SportPlugin`; `analyzer.sports.basketball.BasketballPlugin`.
- Produces:
  - `registry.SPORTS: dict[str, SportPlugin]`; `registry.get_plugin(name: str) -> SportPlugin` (raises `registry.UnknownSport`); `registry.list_sports() -> list[dict]`; `registry.UnknownSport(Exception)` with `.name` and `.supported`.
  - `pipeline.run(frames: list, plugin: SportPlugin) -> dict` — full `/analyze` body incl. `sport`, `motion`, `phase_order`, `camera_view`, `confidence`, `pose_gif`, `phase_images`; `pipeline._extract_phase_metrics(metrics, phases, phase_order) -> dict`.
  - `analyzer` package: `run`, `get_plugin`, `list_sports`, `UnknownSport`.

- [ ] **Step 1: Write `backend/analyzer/pipeline.py`**

```python
from analyzer.sports.base import SportPlugin


def _extract_phase_metrics(metrics: list, phases: dict, phase_order: list) -> dict:
    out: dict = {}
    for phase in phase_order:
        idx = phases.get(phase)
        if idx is not None and 0 <= idx < len(metrics) and metrics[idx] is not None:
            out[phase] = metrics[idx]
        else:
            out[phase] = None
    return out


def run(frames: list, plugin: SportPlugin) -> dict:
    metrics = plugin.frame_metrics(frames)
    seg = plugin.segment(metrics)
    phase_metrics = _extract_phase_metrics(metrics, seg["phases"], plugin.phase_order)
    result = plugin.score(phase_metrics)
    rendered = plugin.render(frames, metrics, seg["phases"], phase_metrics)
    result["sport"] = plugin.name
    result["motion"] = plugin.motion
    result["phase_order"] = list(plugin.phase_order)
    result["camera_view"] = seg["camera_view"]
    result["confidence"] = round(seg["confidence"], 4)
    result["pose_gif"] = rendered["pose_gif"]
    result["phase_images"] = rendered["phase_images"]
    return result
```

- [ ] **Step 2: Write `backend/analyzer/registry.py`**

```python
from analyzer.sports.base import SportPlugin
from analyzer.sports.basketball import BasketballPlugin


class UnknownSport(Exception):
    def __init__(self, name: str, supported: list[str]) -> None:
        self.name = name
        self.supported = supported
        super().__init__(f"unknown sport {name!r}; supported: {', '.join(supported)}")


SPORTS: dict[str, SportPlugin] = {p.name: p for p in (BasketballPlugin(),)}


def get_plugin(name: str) -> SportPlugin:
    try:
        return SPORTS[name]
    except KeyError:
        raise UnknownSport(name, sorted(SPORTS)) from None


def list_sports() -> list[dict]:
    return [
        {
            "name": p.name,
            "display_name": p.display_name,
            "motion": p.motion,
            "phase_order": list(p.phase_order),
        }
        for p in SPORTS.values()
    ]
```

- [ ] **Step 3: Rewrite `backend/analyzer/__init__.py`**

```python
from analyzer.pipeline import run
from analyzer.registry import UnknownSport, get_plugin, list_sports

__all__ = ["run", "get_plugin", "list_sports", "UnknownSport"]
```

- [ ] **Step 4: Write `backend/tests/test_registry.py`**

```python
import pytest

from analyzer.registry import SPORTS, UnknownSport, get_plugin, list_sports


def test_basketball_registered():
    p = get_plugin("basketball")
    assert p.name == "basketball"
    assert p is SPORTS["basketball"]


def test_unknown_sport_raises_with_supported_list():
    with pytest.raises(UnknownSport) as exc:
        get_plugin("curling")
    assert exc.value.name == "curling"
    assert "basketball" in exc.value.supported
    assert "curling" in str(exc.value)


def test_list_sports_shape():
    rows = list_sports()
    assert {"name", "display_name", "motion", "phase_order"} == set(rows[0])
    assert rows[0]["name"] == "basketball"
    assert rows[0]["phase_order"][0] == "ready_position"
```

- [ ] **Step 5: Write `backend/tests/test_pipeline.py`**

```python
from analyzer.pipeline import _extract_phase_metrics, run
from analyzer.sports.base import SportPlugin


class FakePlugin(SportPlugin):
    name = "fake"
    display_name = "Fake"
    motion = "twitch"
    phase_order = ["p1", "p2", "p3"]

    def frame_metrics(self, frames):
        return [None if f is None else {"v": f} for f in frames]

    def segment(self, metrics):
        return {"phases": {"p1": 0, "p2": None, "p3": 2}, "camera_view": "side", "confidence": 0.7123}

    def score(self, phase_metrics):
        return {
            "overall_score": 42.0,
            "priority": "p2",
            "phases": {k: {"score": 0 if v is None else 100} for k, v in phase_metrics.items()},
        }


def test_extract_phase_metrics_handles_none_and_out_of_range():
    metrics = [{"a": 1}, None, {"a": 3}]
    got = _extract_phase_metrics(metrics, {"p1": 0, "p2": 1, "p3": 9, "p4": None}, ["p1", "p2", "p3", "p4"])
    assert got == {"p1": {"a": 1}, "p2": None, "p3": None, "p4": None}


def test_run_merges_additive_keys_and_render_defaults():
    result = run([10, None, 30], FakePlugin())
    assert result["sport"] == "fake"
    assert result["motion"] == "twitch"
    assert result["phase_order"] == ["p1", "p2", "p3"]
    assert result["camera_view"] == "side"
    assert result["confidence"] == 0.7123
    assert result["overall_score"] == 42.0
    assert result["pose_gif"] == ""
    assert result["phase_images"] == {
        "p1": {"user_frame": "", "ideal_frame": ""},
        "p2": {"user_frame": "", "ideal_frame": ""},
        "p3": {"user_frame": "", "ideal_frame": ""},
    }
    # p2 had no index -> scored as missing
    assert result["phases"]["p2"]["score"] == 0
    assert result["phases"]["p1"]["score"] == 100
```

- [ ] **Step 6: Write `backend/tests/test_plugin_contract.py`**

```python
import pytest

from analyzer.registry import SPORTS
from tests.conftest import load_fixture

PLUGINS = list(SPORTS.values())
IDS = [p.name for p in PLUGINS]


@pytest.mark.parametrize("plugin", PLUGINS, ids=IDS)
def test_frame_metrics_returns_aligned_list(plugin):
    frames = load_fixture("good_form_side")
    m = plugin.frame_metrics(frames)
    assert isinstance(m, list)
    assert len(m) == len(frames)
    assert any(isinstance(x, dict) for x in m)
    for row in m:
        assert row is None or isinstance(row, dict)


@pytest.mark.parametrize("plugin", PLUGINS, ids=IDS)
def test_segment_shape(plugin):
    m = plugin.frame_metrics(load_fixture("good_form_side"))
    seg = plugin.segment(m)
    assert set(seg) == {"phases", "camera_view", "confidence"}
    assert set(seg["phases"]) <= set(plugin.phase_order)
    assert isinstance(seg["camera_view"], str)
    assert 0.0 <= seg["confidence"] <= 1.0


@pytest.mark.parametrize("plugin", PLUGINS, ids=IDS)
def test_score_shape(plugin):
    m = plugin.frame_metrics(load_fixture("good_form_side"))
    seg = plugin.segment(m)
    from analyzer.pipeline import _extract_phase_metrics
    pm = _extract_phase_metrics(m, seg["phases"], plugin.phase_order)
    result = plugin.score(pm)
    assert set(result) == {"overall_score", "priority", "phases"}
    assert set(result["phases"]) <= set(plugin.phase_order)
    assert result["priority"] in plugin.phase_order
```

- [ ] **Step 7: Update `backend/tests/test_core_purity.py`**

Replace the `CORE` list with:

```python
CORE = [
    "geometry.py",
    "scoring_curve.py",
    "camera.py",
    "skeleton.py",
    "pipeline.py",
    "registry.py",
    "sports/base.py",
    "sports/basketball/__init__.py",
    "sports/basketball/metrics.py",
    "sports/basketball/phases.py",
    "sports/basketball/scoring.py",
    # legacy modules still present until Task 6
    "angles.py",
    "phases.py",
    "scoring.py",
]
```

`ANALYZER / fname` already resolves nested paths (`sports/base.py`) because `Path.__truediv__` accepts a relative sub-path string. No other change to the test.

- [ ] **Step 8: Run**

Run: `cd backend && python -m pytest tests/test_registry.py tests/test_pipeline.py tests/test_plugin_contract.py tests/test_core_purity.py -v`
Expected: all pass.

Run: `cd backend && python -m pytest -m "not mediapipe" -q`
Expected: full suite green. `capture_current_golden.py` / `test_no_regression.py` / `test_pipeline_golden.py` / `api.py` still import the old `analyzer.angles`/`phases`/`scoring` directly (not via `analyzer/__init__.py`), and those modules still exist — so they still pass.

Run: `cd backend && python -m ruff check .`
Expected: `All checks passed!`

- [ ] **Step 9: Commit**

```bash
git add backend/analyzer/registry.py backend/analyzer/pipeline.py backend/analyzer/__init__.py \
        backend/tests/test_registry.py backend/tests/test_pipeline.py \
        backend/tests/test_plugin_contract.py backend/tests/test_core_purity.py
git commit -m "feat(backend): sport registry + generic pipeline.run orchestrator"
```

---

## Task 5: Repoint the golden regression net

**Files:**
- Modify: `backend/tests/capture_current_golden.py`
- Modify: `backend/tests/test_pipeline_golden.py` (import line only)
- Modify: `backend/tests/test_no_regression.py` (import line only)
- Regenerate: `backend/tests/golden/current_*.json` (must be byte-identical)

**Interfaces:**
- Consumes: `analyzer.registry.get_plugin`; `analyzer.pipeline._extract_phase_metrics`.
- Produces: `tests.capture_current_golden.run_core(name) -> dict` with the **unchanged** shape `{"phases": <indices>, "camera_view": str, "confidence": float, "analysis": {"overall_score", "priority", "phases"}}`.

- [ ] **Step 1: Rewrite `backend/tests/capture_current_golden.py`**

```python
"""One-shot: freeze the NEW core pipeline output on the fixtures.
Run from backend/: python -m tests.capture_current_golden
"""
import json
from pathlib import Path

from analyzer.pipeline import _extract_phase_metrics
from analyzer.registry import get_plugin
from tests.conftest import load_fixture

OUT = Path(__file__).parent / "golden"
NAMES = ["good_form_side", "shallow_load_side", "elbow_flare_side", "front_view", "truncated"]


def run_core(name: str) -> dict:
    plugin = get_plugin("basketball")
    frames = load_fixture(name)
    metrics = plugin.frame_metrics(frames)
    seg = plugin.segment(metrics)
    phase_metrics = _extract_phase_metrics(metrics, seg["phases"], plugin.phase_order)
    analysis = plugin.score(phase_metrics)
    return {
        "phases": seg["phases"],
        "camera_view": seg["camera_view"],
        "confidence": round(seg["confidence"], 4),
        "analysis": analysis,
    }


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name in NAMES:
        (OUT / f"current_{name}.json").write_text(
            json.dumps(run_core(name), indent=2, sort_keys=True)
        )
    print("wrote", len(NAMES), "current goldens to", OUT)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify the goldens do not change**

Run: `cd backend && python -m tests.capture_current_golden && git status --porcelain backend/tests/golden/`
Expected: `wrote 5 current goldens to …` and **no** modified files under `backend/tests/golden/`. If any `current_*.json` changed, STOP — the basketball refactor altered behaviour. Diff the change, find which of Tasks 1–4 introduced it, and fix that task before proceeding.

- [ ] **Step 3: Run the regression tests**

`test_pipeline_golden.py` and `test_no_regression.py` both do `from tests.capture_current_golden import run_core` — that import still resolves, no edit needed. Confirm:

Run: `cd backend && python -m pytest tests/test_pipeline_golden.py tests/test_no_regression.py -v`
Expected: 5 + 5 passed.

- [ ] **Step 4: Full suite + ruff**

Run: `cd backend && python -m pytest -m "not mediapipe" -q`
Expected: green.

Run: `cd backend && python -m ruff check .`
Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add backend/tests/capture_current_golden.py backend/tests/golden/
git commit -m "test(backend): golden capture drives the basketball plugin; output unchanged"
```

(`git add backend/tests/golden/` will stage nothing if the files are byte-identical — that is the expected, correct outcome. The commit still records the `capture_current_golden.py` change.)

---

## Task 6: API — `sport` param, `GET /sports`, delete legacy modules

**Files:**
- Modify: `backend/api.py`
- Modify: `backend/tests/test_api.py`
- Delete: `backend/analyzer/angles.py`, `backend/analyzer/phases.py`, `backend/analyzer/scoring.py`, `backend/analyzer/rendering.py`
- Modify: `backend/tests/test_core_purity.py` (drop the deleted modules from `CORE`)
- Modify: `backend/CHANGES.md`, `backend/README.md`

**Interfaces:**
- Consumes: `analyzer.pose`; `analyzer.pipeline.run`; `analyzer.registry.{get_plugin, list_sports, UnknownSport}`.
- Produces: `POST /analyze` (multipart `video` + required `sport`); `GET /sports`.

- [ ] **Step 1: Rewrite `backend/api.py`**

```python
import logging
import os
import tempfile
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from analyzer import pose
from analyzer.pipeline import run as run_pipeline
from analyzer.registry import UnknownSport, get_plugin, list_sports

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/sports")
def sports() -> list[dict]:
    return list_sports()


@router.post("/analyze")
async def analyze_shot(
    video: Annotated[UploadFile, File()],
    sport: Annotated[str, Form()] = "",
) -> dict:
    if not sport:
        raise HTTPException(400, "sport is required")
    try:
        plugin = get_plugin(sport)
    except UnknownSport as exc:
        raise HTTPException(400, str(exc)) from exc

    suffix = os.path.splitext(video.filename or "shot.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name

    try:
        frames = await run_in_threadpool(pose.extract_landmarks_from_video, tmp_path)
        if not frames or all(f is None for f in frames):
            raise HTTPException(422, "No pose detected. Ensure your full body is visible.")
        return await run_in_threadpool(run_pipeline, frames, plugin)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("analyze failed")
        raise HTTPException(500, "Internal server error") from exc
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
```

- [ ] **Step 2: Rewrite `backend/tests/test_api.py`**

```python
import io

import pytest
from fastapi.testclient import TestClient

from tests import synth


@pytest.fixture
def client(monkeypatch):
    from analyzer import pose
    from analyzer.sports.basketball import rendering

    raw = []
    for f in synth.make_shot(n_frames=60):
        f = dict(f)
        f["_frame"] = None
        f["_raw_landmarks"] = None
        raw.append(f)

    monkeypatch.setattr(pose, "extract_landmarks_from_video", lambda _p: raw)
    monkeypatch.setattr(rendering, "generate_pose_gif", lambda *a, **k: "")
    monkeypatch.setattr(
        rendering, "render_phase_images",
        lambda *a, **k: {p: {"user_frame": "", "ideal_frame": ""} for p in
                         ["ready_position", "load", "set_point", "release", "follow_through"]},
    )
    import main
    return TestClient(main.app)


def _post(client, **extra):
    return client.post(
        "/analyze",
        files={"video": ("shot.mp4", io.BytesIO(b"x"), "video/mp4")},
        data=extra,
    )


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_sports_lists_basketball(client):
    rows = client.get("/sports").json()
    assert any(r["name"] == "basketball" for r in rows)
    bb = next(r for r in rows if r["name"] == "basketball")
    assert bb["phase_order"] == ["ready_position", "load", "set_point", "release", "follow_through"]


def test_analyze_requires_sport(client):
    r = _post(client)
    assert r.status_code == 400
    assert r.json()["detail"] == "sport is required"


def test_analyze_rejects_unknown_sport(client):
    r = _post(client, sport="curling")
    assert r.status_code == 400
    assert "curling" in r.json()["detail"]


def test_analyze_returns_legacy_shape_plus_new_fields(client):
    r = _post(client, sport="basketball")
    assert r.status_code == 200
    body = r.json()
    assert {"overall_score", "priority", "phases", "pose_gif", "phase_images"} <= body.keys()
    assert body["sport"] == "basketball"
    assert body["motion"] == "jump shot"
    assert body["phase_order"] == ["ready_position", "load", "set_point", "release", "follow_through"]
    assert body["camera_view"] in {"side", "front", "oblique"}
    assert 0.0 <= body["confidence"] <= 1.0
    assert set(body["phases"]) == {
        "ready_position", "load", "set_point", "release", "follow_through"
    }


def test_analyze_422_when_no_pose(client, monkeypatch):
    from analyzer import pose
    monkeypatch.setattr(pose, "extract_landmarks_from_video", lambda _p: [None] * 30)
    r = _post(client, sport="basketball")
    assert r.status_code == 422


def test_analyze_500_hides_internal_error(client, monkeypatch):
    def boom(_p):
        raise RuntimeError("/private/tmp/leaky/path detail")

    from analyzer import pose
    monkeypatch.setattr(pose, "extract_landmarks_from_video", boom)
    r = _post(client, sport="basketball")
    assert r.status_code == 500
    assert r.json()["detail"] == "Internal server error"
```

- [ ] **Step 3: Run the API tests — expect pass**

Run: `cd backend && python -m pytest tests/test_api.py -v`
Expected: 8 passed.

- [ ] **Step 4: Delete the legacy modules**

```bash
git rm backend/analyzer/angles.py backend/analyzer/phases.py \
       backend/analyzer/scoring.py backend/analyzer/rendering.py
```

Then confirm nothing imports them:

Run: `cd backend && grep -rn "analyzer.angles\|analyzer.phases\|analyzer.scoring\|analyzer.rendering\|analyzer import angles\|analyzer import phases\|analyzer import scoring\|analyzer import rendering" --include=*.py .`
Expected: no hits except `tests/capture_legacy_golden.py` (which imports even-older already-deleted modules and carries a "do not run" header — leave it). If any live module or test still imports the four deleted files, fix that reference.

- [ ] **Step 5: Update `backend/tests/test_core_purity.py`**

Remove `"angles.py"`, `"phases.py"`, `"scoring.py"` and the `# legacy modules …` comment from `CORE`. Final list:

```python
CORE = [
    "geometry.py",
    "scoring_curve.py",
    "camera.py",
    "skeleton.py",
    "pipeline.py",
    "registry.py",
    "sports/base.py",
    "sports/basketball/__init__.py",
    "sports/basketball/metrics.py",
    "sports/basketball/phases.py",
    "sports/basketball/scoring.py",
]
```

- [ ] **Step 6: Full suite + ruff (the make-or-break gate)**

Run: `cd backend && python -m pytest -m "not mediapipe" -v`
Expected: every test passes.

Run: `cd backend && python -m ruff check .`
Expected: `All checks passed!` If any error remains: if it is in a deleted file, the `git rm` did not take — re-run it; if it is new code, fix it; if it is a pre-existing file outside this task's scope, STOP and report.

Run: `cd backend && python -c "import main; print(sorted(r.path for r in main.app.routes))"`
Expected: includes `/analyze`, `/health`, `/sports`.

- [ ] **Step 7: Update `backend/CHANGES.md`**

Append:

```markdown
## 6. Multi-sport architecture (sub-project A)

The analyzer pipeline is now sport-pluggable. `analyzer/angles.py`,
`phases.py`, `scoring.py`, and `rendering.py` were split into a
sport-agnostic core (`geometry`, `scoring_curve`, `camera`, `skeleton`,
`pipeline`, `registry`) and a first plugin at
`analyzer/sports/basketball/` implementing the `SportPlugin` ABC
(`frame_metrics` / `segment` / `score` / `render`).

Basketball's analysis output is unchanged — `tests/golden/current_*.json`
regenerated byte-identical.

### API changes

- `POST /analyze` now requires a `sport` form field. Missing → `400
  {"detail": "sport is required"}`; unknown → `400 {"detail": "unknown
  sport 'x'; supported: basketball"}`. This is a breaking change for any
  caller that posted only `video`.
- `POST /analyze` responses gain three additive top-level keys: `sport`,
  `motion`, `phase_order`. Everything else is unchanged.
- New `GET /sports` returns `[{name, display_name, motion, phase_order}]`.
```

- [ ] **Step 8: Update `backend/README.md`**

In the test/run section, update the `/analyze` example to include the sport field, e.g. add a line under the run instructions:

```markdown
`POST /analyze` is multipart: `video=<file>` and `sport=basketball`
(list options at `GET /sports`).
```

- [ ] **Step 9: Commit**

```bash
git add backend/api.py backend/tests/test_api.py backend/tests/test_core_purity.py \
        backend/CHANGES.md backend/README.md
git add -u backend/analyzer
git commit -m "feat(backend): /analyze requires sport, add GET /sports, drop legacy analyzer modules"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| Sport-agnostic core: geometry, scoring curve, camera, skeleton | 1 |
| `SportPlugin` interface | 2 (with documented signature corrections) |
| Basketball refactored to `sports/basketball/` plugin #1 | 3 |
| Registry (`get_plugin`, `list_sports`, `UnknownSport`) | 4 |
| `pipeline.run` orchestrator + `_extract_phase_metrics` | 4 |
| `analyzer/__init__.py` exports `get_plugin`/`list_sports`/`run` | 4 |
| `POST /analyze` requires `sport`; 400 on missing/unknown | 6 |
| `GET /sports` discovery endpoint | 6 |
| Additive response keys `sport`/`motion`/`phase_order` | 4 (pipeline) + 6 (test_api) |
| Golden regression: basketball output byte-identical | 5 |
| `test_core_purity` extended to new core + `sports/**` | 1, 4, 6 |
| New `test_registry`, `test_pipeline`, `test_plugin_contract` | 4 |
| Moved per-module basketball tests | 3 |
| Legacy modules deleted | 6 |
| `CHANGES.md` documents the change | 6 |
| CI unchanged in shape | — (no workflow edit needed; larger suite runs as-is) |

Deviations from the spec are listed at the top of this plan (clip-level `frame_metrics`, single `render` method, golden shape unchanged). All three are corrections that keep the spec's intent while making the interface implementable.

**2. Placeholder scan**

`generate_feedback` in Task 3 Step 3 is shown as `...` with an explicit instruction to copy `analyzer/scoring.py` lines 67-121 character-for-character with only the name changed — this is a verbatim relocation of existing reviewed code, not a placeholder for new logic. Same for the `IDEALS`/`PHASE_INFO`/`PHASE_RESOURCES` blocks and the whole of Task 3 Step 4 (rendering). Every genuinely new module (`geometry`, `scoring_curve`, `camera`, `skeleton`, `base`, `pipeline`, `registry`, `metrics` wrapper, `__init__`) is given in full.

**3. Type consistency**

- `frame_metrics(frames: list) -> list` — same signature in `base.py` (T2), `metrics.py` (T3), `BasketballPlugin` (T3), `pipeline.run` call site (T4), `test_plugin_contract` (T4). Consistent.
- `segment(metrics: list) -> dict` returning `{"phases", "camera_view", "confidence"}` — `base.py` (T2), `phases.segment` (T3), `pipeline.run` (T4), `test_plugin_contract` (T4). Consistent.
- `score(phase_metrics: dict) -> dict` returning `{"overall_score", "priority", "phases"}` — `base.py` (T2), `scoring.score` (T3), `pipeline.run` (T4). Consistent.
- `render(...) -> {"pose_gif": str, "phase_images": {...}}` — `base.py` default (T2), `rendering.render_all` (T3), `BasketballPlugin.render` (T3), `pipeline.run` (T4), `test_pipeline` (T4). Consistent.
- `PHASE_ORDER` name used in `phases.py` (T3), imported by `scoring.py` (T3), `test_phases.py`/`test_scoring.py` (T3). `phase_order` (lowercase) is the plugin attribute. Consistent — module constant vs instance attribute, deliberately named the same.
- `get_plugin` / `list_sports` / `UnknownSport` — defined in `registry.py` (T4), re-exported by `__init__.py` (T4), imported by `api.py` (T6). Consistent.
- `_extract_phase_metrics(metrics, phases, phase_order)` — defined in `pipeline.py` (T4), used in `capture_current_golden.py` (T5), `test_plugin_contract.py` (T4). Consistent.

**Ordering safety:** Tasks 1–4 add new modules without touching `analyzer/angles.py`, `phases.py`, `scoring.py`, `rendering.py`, `api.py`, or `analyzer/__init__.py`'s old importers beyond `__init__.py` itself (T4). `capture_current_golden.py` keeps using old modules until T5; `api.py` until T6. The legacy modules are deleted only in T6, after every importer has moved. The suite stays green after every task.
