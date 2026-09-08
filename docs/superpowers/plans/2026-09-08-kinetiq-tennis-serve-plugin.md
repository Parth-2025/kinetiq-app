# Tennis Serve Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second `SportPlugin` to the KinetiQ backend analyser that scores a single tennis serve from a MediaPipe pose sequence — a 6-phase serve model, per-frame metrics, literature-derived ideal bands, per-phase feedback, and side-profile ideal-pose overlays.

**Architecture:** A new package `backend/analyzer/sports/tennis/` with the same four-module shape as `sports/basketball/` (`metrics.py`, `phases.py`, `scoring.py`, `rendering.py`) plus a thin `TennisPlugin` in `__init__.py`. It calls the existing shared helpers (`geometry.calculate_angle`, `scoring_curve.score_metric`, `camera.classify_camera_view`, `skeleton.generate_pose_gif`, `skeleton.extract_phase_frame_b64`) and owns only its phase model and scoring config. Registration is one line in `analyzer/registry.py`; everything else is additive. Tests run with no video/MediaPipe via a new deterministic `synth.make_serve()` fixture.

**Tech Stack:** Python 3.11, numpy, OpenCV (`cv2`) + Pillow (rendering only), pytest, ruff.

**Spec:** `docs/superpowers/specs/2026-09-08-kinetiq-tennis-serve-plugin-design.md`

## Global Constraints

- Python 3.11 target (`ruff` `target-version = "py311"`); MediaPipe has no 3.13 wheels.
- `ruff check .` from `backend/` must stay clean: `select = E,F,I,UP,B`, `ignore = E501`, `line-length = 100`, `src = ["."]`.
- Tests run as `cd backend && python -m pytest`, `pythonpath = ["."]`. CI runs `pytest -m "not mediapipe"` on 3.11.
- **Core purity:** `analyzer/sports/tennis/metrics.py`, `phases.py`, `scoring.py` import only `numpy` and the standard library — never `fastapi`, `cv2`, `PIL`, `mediapipe`, `sqlalchemy`, `starlette`. `cv2`/`PIL` are permitted only in `analyzer/sports/tennis/rendering.py`. Enforced by `tests/test_core_purity.py` (AST scan).
- Basketball `/analyze` output is unchanged. `tests/golden/*`, `tests/test_no_regression.py`, `tests/test_pipeline_golden.py` are NOT modified. Tennis is purely additive.
- All work on branch `tennis-serve-plugin` (already created, spec already committed there as `ea43104`). Never commit to `main`.
- Commits attributed to `Parth Mohan <parthmohan2006@gmail.com>` with trailers:
  - `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy`

## Deviation from spec (ruling recorded here for the reviewer)

The spec's `shoulder_hip_separation` metric is kept, with a **concrete image-plane definition** given in Task 1 (difference between the shoulder-line inclination and the hip-line inclination, folded to `[0, 90]`). From a pure side view this mostly tracks the shoulder-over-shoulder tilt rather than true transverse counter-rotation, which MediaPipe 2D cannot recover; on the oblique footage KinetiQ actually receives it also picks up the upper-body coil. This is the honest measurable proxy and it is deterministic to synthesize and test. No other spec metric changes.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `backend/analyzer/sports/tennis/__init__.py` | package marker (Task 1) → `TennisPlugin` class (Task 6) | 1, 6 |
| `backend/analyzer/sports/tennis/metrics.py` | `frame_metrics(frames)` whole-clip pass; `_frame_metrics(frame, side)`; private geometry helpers `_angle_between`, `_line_incline` | 1 |
| `backend/analyzer/sports/tennis/phases.py` | `PHASE_ORDER`; `segment(metrics) -> {phases, camera_view, confidence}` | 3 |
| `backend/analyzer/sports/tennis/scoring.py` | `IDEALS`, `PHASE_INFO`, `PHASE_RESOURCES`, `generate_feedback`, `score(phase_metrics)` | 4 |
| `backend/analyzer/sports/tennis/rendering.py` | `render_all(...)`, `draw_ideal_skeleton(...)`, `_IDEAL_PROFILE`, `_IDEAL_PHASE` | 5 |
| `backend/analyzer/registry.py` | add `TennisPlugin()` to `SPORTS` | 6 |
| `backend/tests/synth.py` | add `make_serve(...)`, `SERVE_SCENARIOS`, `no_pose` reuse | 2 |
| `backend/tests/gen_fixtures.py` | also emit `serve_*.json` | 2 |
| `backend/tests/conftest.py` | add `SERVE_FIXTURE_NAMES`, `load_fixture` already generic | 2 |
| `backend/tests/fixtures/serve_*.json` | generated serve fixtures (committed) | 2 |
| `backend/tests/test_tennis_metrics.py` | metrics unit tests | 1 |
| `backend/tests/test_synth_serve.py` | fixture sanity + determinism | 2 |
| `backend/tests/test_tennis_phases.py` | segmentation tests | 3 |
| `backend/tests/test_tennis_scoring.py` | scoring/feedback tests | 4 |
| `backend/tests/test_tennis_rendering_smoke.py` | rendering smoke tests | 5 |
| `backend/tests/test_core_purity.py` | add 4 tennis modules to `CORE` | 6 |
| `backend/tests/test_registry.py` | assert tennis registered | 6 |
| `backend/tests/test_api.py` | `/sports` lists tennis; `/analyze` `sport=tennis` | 6 |

Package form (four modules) is fixed — matches basketball; do not collapse.

---

### Task 1: Tennis per-frame metrics

**Files:**
- Create: `backend/analyzer/sports/tennis/__init__.py`
- Create: `backend/analyzer/sports/tennis/metrics.py`
- Test: `backend/tests/test_tennis_metrics.py`

**Interfaces:**
- Consumes: `analyzer.geometry.calculate_angle(a, b, c) -> float` (degrees; takes 3 sequences of 3 floats). `analyzer.geometry.LANDMARKS` (name→index dict, not needed here). Frame dict shape: `{landmark_name: np.ndarray([x, y, z, visibility])}` with `x, y` in `[0, 1]`, `y` downward. Landmark names present: `nose`, `left/right_shoulder`, `left/right_elbow`, `left/right_wrist`, `left/right_hip`, `left/right_knee`, `left/right_ankle` (and more, unused).
- Produces:
  - `frame_metrics(frames: list) -> list` — one dict per non-`None` input frame, `None` passthrough; determines dominant side once for the whole clip.
  - `_frame_metrics(frame: dict, side: str) -> dict` — flat metric dict for one frame; `side` is `"right"` or `"left"`.
  - Metric keys (exact): `dominant_side`, `hitting_elbow_angle`, `tossing_arm_angle`, `knee_angle`, `trunk_tilt`, `shoulder_hip_separation`, `shoulder_tilt`, `dominant_arm_elevation`, `contact_reach`, `tossing_wrist_y`, `dominant_wrist_y`, `dominant_shoulder_y`, `torso_width`, `torso_height`.

- [ ] **Step 1: Create the package marker**

`backend/analyzer/sports/tennis/__init__.py`:

```python
"""Tennis serve analysis plugin. See docs/superpowers/specs/2026-09-08-kinetiq-tennis-serve-plugin-design.md."""
```

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_tennis_metrics.py`:

```python
import numpy as np
import pytest

from analyzer.sports.tennis.metrics import _frame_metrics, frame_metrics
from tests import synth

KEYS = {
    "dominant_side", "hitting_elbow_angle", "tossing_arm_angle", "knee_angle",
    "trunk_tilt", "shoulder_hip_separation", "shoulder_tilt",
    "dominant_arm_elevation", "contact_reach", "tossing_wrist_y",
    "dominant_wrist_y", "dominant_shoulder_y", "torso_width", "torso_height",
}


def _hand_frame(**overrides):
    """A minimal upright figure facing +x; y grows downward."""
    base = {
        "nose": [0.50, 0.12, 0.0, 1.0],
        "left_shoulder": [0.47, 0.26, 0.0, 1.0],
        "right_shoulder": [0.53, 0.26, 0.0, 1.0],
        "left_elbow": [0.46, 0.40, 0.0, 1.0],
        "right_elbow": [0.54, 0.40, 0.0, 1.0],
        "left_wrist": [0.45, 0.52, 0.0, 1.0],
        "right_wrist": [0.55, 0.52, 0.0, 1.0],
        "left_hip": [0.47, 0.52, 0.0, 1.0],
        "right_hip": [0.53, 0.52, 0.0, 1.0],
        "left_knee": [0.47, 0.70, 0.0, 1.0],
        "right_knee": [0.53, 0.70, 0.0, 1.0],
        "left_ankle": [0.47, 0.88, 0.0, 1.0],
        "right_ankle": [0.53, 0.88, 0.0, 1.0],
    }
    base.update(overrides)
    return {k: np.asarray(v, dtype=float) for k, v in base.items()}


def test_key_set_exact():
    m = _frame_metrics(_hand_frame(), "right")
    assert set(m) == KEYS


def test_straight_arm_up_has_small_elevation():
    # right wrist directly above right shoulder -> elevation ~ 0
    f = _hand_frame(
        right_elbow=[0.53, 0.13, 0.0, 1.0],
        right_wrist=[0.53, 0.00, 0.0, 1.0],
    )
    m = _frame_metrics(f, "right")
    assert m["dominant_arm_elevation"] < 5.0
    assert m["hitting_elbow_angle"] > 170.0


def test_level_shoulders_and_hips_zero_separation_and_tilt():
    m = _frame_metrics(_hand_frame(), "right")
    assert m["shoulder_hip_separation"] < 1.0
    assert m["shoulder_tilt"] < 1e-6
    assert m["trunk_tilt"] < 1.0


def test_dropped_right_shoulder_raises_separation_and_tilt():
    f = _hand_frame(right_shoulder=[0.53, 0.33, 0.0, 1.0])
    m = _frame_metrics(f, "right")
    assert m["shoulder_tilt"] > 0.05
    assert m["shoulder_hip_separation"] > 20.0


def test_contact_reach_negative_when_wrist_above_nose():
    f = _hand_frame(right_wrist=[0.53, 0.02, 0.0, 1.0])
    m = _frame_metrics(f, "right")
    assert m["contact_reach"] == pytest.approx(0.02 - 0.12, abs=1e-6)
    assert m["contact_reach"] < 0


def test_backward_trunk_lean_increases_trunk_tilt():
    # shoulders shifted -x relative to hips -> torso leans from vertical
    f = _hand_frame(
        left_shoulder=[0.37, 0.27, 0.0, 1.0],
        right_shoulder=[0.43, 0.27, 0.0, 1.0],
    )
    m = _frame_metrics(f, "right")
    assert m["trunk_tilt"] > 15.0


def test_dominant_side_follows_highest_wrist_over_clip():
    right = frame_metrics(synth.make_serve(dominant_side="right"))
    left = frame_metrics(synth.make_serve(dominant_side="left"))
    assert next(x for x in right if x)["dominant_side"] == "right"
    assert next(x for x in left if x)["dominant_side"] == "left"


def test_none_passthrough_and_alignment():
    frames = synth.make_serve(n_frames=12)
    frames[0] = None
    frames[5] = None
    out = frame_metrics(frames)
    assert len(out) == 12
    assert out[0] is None and out[5] is None
    assert all(isinstance(x, dict) for i, x in enumerate(out) if i not in (0, 5))


def test_all_none_clip_returns_all_none():
    out = frame_metrics([None, None, None])
    assert out == [None, None, None]
```

Note: `test_dominant_side_*`, `test_none_passthrough_*`, `test_all_none_*` depend on `synth.make_serve` (Task 2). Mark the file so the suite is green after Task 1 by guarding those three with `pytest.importorskip` is NOT allowed — instead, in this task, run only the hand-frame tests (`pytest backend/tests/test_tennis_metrics.py -k "not synth and not dominant_side and not none_passthrough and not all_none"`). Task 2 re-runs the whole file.

- [ ] **Step 3: Run the hand-frame tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_tennis_metrics.py -k "key_set or elevation or separation or contact_reach or trunk_tilt" -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'analyzer.sports.tennis.metrics'`.

- [ ] **Step 4: Implement `metrics.py`**

`backend/analyzer/sports/tennis/metrics.py`:

```python
"""Per-frame tennis-serve metrics from MediaPipe pose landmarks.

MediaPipe Pose gives body landmarks only — no racket, no ball. The dominant
(racket) wrist is the racket proxy throughout. All angle metrics are degrees;
all ``*_y`` metrics are normalised image coordinates (y grows downward).

Imports: numpy + stdlib + analyzer.geometry only (core-purity constraint).
"""
import math

import numpy as np

from analyzer.geometry import calculate_angle


def _angle_between(u: np.ndarray, v: np.ndarray) -> float:
    """Unsigned angle in degrees between two 2-D vectors, in [0, 180]."""
    nu = float(np.linalg.norm(u))
    nv = float(np.linalg.norm(v))
    if nu < 1e-9 or nv < 1e-9:
        return 0.0
    cos = float(np.dot(u, v) / (nu * nv))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def _line_incline(left: np.ndarray, right: np.ndarray) -> float:
    """Inclination in degrees of the left->right segment from the image
    horizontal, in [-90, 90]. Robust to the segment being near-vertical."""
    dx = float(right[0] - left[0])
    dy = float(right[1] - left[1])
    return math.degrees(math.atan2(dy, dx))


def _fold_90(deg: float) -> float:
    """Fold an angle difference into [0, 90]."""
    a = abs(deg) % 180.0
    return a if a <= 90.0 else 180.0 - a


def _frame_metrics(frame: dict, side: str) -> dict:
    opp = "left" if side == "right" else "right"

    d_sh = np.asarray(frame[f"{side}_shoulder"], dtype=float)
    d_el = np.asarray(frame[f"{side}_elbow"], dtype=float)
    d_wr = np.asarray(frame[f"{side}_wrist"], dtype=float)
    n_sh = np.asarray(frame[f"{opp}_shoulder"], dtype=float)
    n_el = np.asarray(frame[f"{opp}_elbow"], dtype=float)
    n_wr = np.asarray(frame[f"{opp}_wrist"], dtype=float)
    l_sh = np.asarray(frame["left_shoulder"], dtype=float)
    r_sh = np.asarray(frame["right_shoulder"], dtype=float)
    l_hip = np.asarray(frame["left_hip"], dtype=float)
    r_hip = np.asarray(frame["right_hip"], dtype=float)
    nose = np.asarray(frame["nose"], dtype=float)

    sh_mid = (l_sh[:2] + r_sh[:2]) / 2.0
    hip_mid = (l_hip[:2] + r_hip[:2]) / 2.0

    knee_l = calculate_angle(
        frame["left_hip"][:3], frame["left_knee"][:3], frame["left_ankle"][:3]
    )
    knee_r = calculate_angle(
        frame["right_hip"][:3], frame["right_knee"][:3], frame["right_ankle"][:3]
    )

    torso_vec = sh_mid - hip_mid           # points up-ish (negative dy)
    trunk_tilt = _angle_between(torso_vec, np.array([0.0, -1.0]))

    arm_vec = d_wr[:2] - d_sh[:2]          # shoulder -> wrist
    dominant_arm_elevation = _angle_between(arm_vec, np.array([0.0, -1.0]))

    sep = _fold_90(_line_incline(l_sh[:2], r_sh[:2]) - _line_incline(l_hip[:2], r_hip[:2]))

    return {
        "dominant_side": side,
        "hitting_elbow_angle": calculate_angle(d_sh[:3], d_el[:3], d_wr[:3]),
        "tossing_arm_angle": calculate_angle(n_sh[:3], n_el[:3], n_wr[:3]),
        "knee_angle": (knee_l + knee_r) / 2.0,
        "trunk_tilt": trunk_tilt,
        "shoulder_hip_separation": sep,
        "shoulder_tilt": abs(float(l_sh[1]) - float(r_sh[1])),
        "dominant_arm_elevation": dominant_arm_elevation,
        "contact_reach": float(d_wr[1]) - float(nose[1]),
        "tossing_wrist_y": float(n_wr[1]),
        "dominant_wrist_y": float(d_wr[1]),
        "dominant_shoulder_y": float(d_sh[1]),
        "torso_width": abs(float(l_sh[0]) - float(r_sh[0])),
        "torso_height": abs(float(hip_mid[1]) - float(sh_mid[1])),
    }


def frame_metrics(frames: list) -> list:
    lw = [float(f["left_wrist"][1]) for f in frames if f is not None]
    rw = [float(f["right_wrist"][1]) for f in frames if f is not None]
    if not lw and not rw:
        return [None] * len(frames)
    side = "right" if min(rw, default=1.0) <= min(lw, default=1.0) else "left"
    return [_frame_metrics(f, side) if f is not None else None for f in frames]
```

- [ ] **Step 5: Run the hand-frame tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_tennis_metrics.py -k "key_set or elevation or separation or contact_reach or trunk_tilt or level_shoulders" -v`
Expected: PASS (6 tests).

- [ ] **Step 6: Lint**

Run: `cd backend && ruff check analyzer/sports/tennis/`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add backend/analyzer/sports/tennis/__init__.py backend/analyzer/sports/tennis/metrics.py backend/tests/test_tennis_metrics.py
git commit -m "feat(tennis): per-frame serve metrics" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 2: Synthetic serve fixture

**Files:**
- Modify: `backend/tests/synth.py` (add `make_serve`, `SERVE_SCENARIOS`)
- Modify: `backend/tests/gen_fixtures.py` (emit `serve_*.json`)
- Modify: `backend/tests/conftest.py` (add `SERVE_FIXTURE_NAMES`)
- Create: `backend/tests/fixtures/serve_good.json`, `serve_shallow_trophy.json`, `serve_truncated.json`, `serve_no_pose.json` (generated, committed)
- Test: `backend/tests/test_synth_serve.py`

**Interfaces:**
- Consumes: existing `synth._lerp_keys`, `synth._rot`, `synth._p`, `synth.no_pose`.
- Produces:
  - `synth.make_serve(n_frames=48, dominant_side="right", view="side", trophy_knee_deg=124.0, truncate_frac=None) -> list[dict]` — deterministic; frames are `dict[str, np.ndarray([x,y,z,vis])]`; sweeps stance→toss→trophy→cocking→contact→follow_through in order.
  - `synth.SERVE_SCENARIOS: dict[str, dict]` — kwargs per named fixture.
  - `conftest.SERVE_FIXTURE_NAMES: list[str]` = `["serve_good", "serve_shallow_trophy", "serve_truncated", "serve_no_pose"]`.
  - `conftest.load_fixture(name)` already deserialises any `fixtures/<name>.json`.

- [ ] **Step 1: Write the failing fixture sanity test**

`backend/tests/test_synth_serve.py`:

```python
import numpy as np

from tests import synth

_LM = set(synth.LANDMARK_NAMES)


def test_make_serve_deterministic():
    a = synth.make_serve(n_frames=40)
    b = synth.make_serve(n_frames=40)
    assert len(a) == len(b) == 40
    for fa, fb in zip(a, b, strict=True):
        for k in _LM:
            assert np.allclose(fa[k], fb[k])


def test_every_frame_has_all_landmarks():
    for f in synth.make_serve(n_frames=30):
        assert set(f) == _LM
        for v in f.values():
            assert np.asarray(v).shape == (4,)


def test_toss_wrist_peaks_before_dominant_wrist_peak():
    frames = synth.make_serve(n_frames=48, dominant_side="right")
    left_y = [float(f["left_wrist"][1]) for f in frames]
    right_y = [float(f["right_wrist"][1]) for f in frames]
    toss_peak = int(np.argmin(left_y))       # highest = smallest y
    contact_peak = int(np.argmin(right_y))
    assert toss_peak < contact_peak
    assert 0.15 < toss_peak / 48 < 0.45
    assert 0.55 < contact_peak / 48 < 0.80


def test_knee_bends_deepest_between_toss_and_contact():
    frames = synth.make_serve(n_frames=48)
    from analyzer.sports.tennis.metrics import frame_metrics
    m = frame_metrics(frames)
    knee = [x["knee_angle"] for x in m]
    trophy = int(np.argmin(knee))
    left_y = [float(f["left_wrist"][1]) for f in frames]
    right_y = [float(f["right_wrist"][1]) for f in frames]
    assert int(np.argmin(left_y)) < trophy < int(np.argmin(right_y))


def test_truncated_is_shorter_and_min_six_frames():
    full = synth.make_serve(n_frames=48)
    trunc = synth.make_serve(n_frames=48, truncate_frac=0.45)
    assert 6 <= len(trunc) < len(full)


def test_scenarios_and_fixture_names_align():
    assert set(synth.SERVE_SCENARIOS) == {"serve_good", "serve_shallow_trophy", "serve_truncated"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_synth_serve.py -v`
Expected: FAIL — `AttributeError: module 'tests.synth' has no attribute 'make_serve'`.

- [ ] **Step 3: Add `make_serve` to `synth.py`**

Append to `backend/tests/synth.py` (after `make_shot`, before `no_pose`):

```python
# --- tennis serve ---------------------------------------------------------

# fraction of clip -> degrees / normalised units
_SRV_KNEE = [(0.0, 173), (0.12, 171), (0.42, None), (0.60, 150), (0.70, 176), (1.0, 178)]
_SRV_TRUNK_TILT = [(0.0, 2), (0.12, 3), (0.42, 11), (0.55, 22), (0.70, 6), (1.0, 4)]
_SRV_HIT_ELBOW = [(0.0, 150), (0.30, 122), (0.42, 100), (0.55, 96),
                  (0.70, 172), (0.85, 62), (1.0, 55)]
_SRV_HIT_ARM_ELEV = [(0.0, 168), (0.30, 112), (0.42, 96), (0.55, 82),
                     (0.70, 9), (0.85, 108), (1.0, 128)]
_SRV_TOSS_ARM_ELEV = [(0.0, 168), (0.14, 92), (0.30, 7), (0.46, 62),
                      (0.66, 150), (1.0, 165)]
_SRV_TOSS_ELBOW = [(0.0, 158), (0.30, 176), (0.60, 150), (1.0, 148)]
_SRV_SH_DROP = [(0.0, 0.005), (0.42, 0.09), (0.55, 0.11), (0.70, 0.04), (1.0, 0.01)]


def make_serve(
    n_frames: int = 48,
    dominant_side: str = "right",
    view: str = "side",
    trophy_knee_deg: float = 124.0,
    truncate_frac: float | None = None,
) -> list[dict]:
    """Deterministic side-view tennis serve. Figure faces +x; the dominant
    arm is on the +x side. Sweeps stance -> toss -> trophy -> cocking ->
    contact -> follow_through in temporal order."""
    knee_keys = [(f, v if v is not None else trophy_knee_deg) for f, v in _SRV_KNEE]
    shoulder_sep = 0.06 if view == "side" else 0.24
    sign = 1.0 if dominant_side == "right" else -1.0
    up = np.array([0.0, -1.0])
    total = n_frames if truncate_frac is None else max(6, int(n_frames * truncate_frac))
    frames: list[dict] = []

    for i in range(total):
        t = i / (n_frames - 1)
        knee_a = _lerp_keys(t, knee_keys)
        trunk = _lerp_keys(t, _SRV_TRUNK_TILT)
        hit_elbow = _lerp_keys(t, _SRV_HIT_ELBOW)
        hit_elev = _lerp_keys(t, _SRV_HIT_ARM_ELEV)
        toss_elev = _lerp_keys(t, _SRV_TOSS_ARM_ELEV)
        toss_elbow = _lerp_keys(t, _SRV_TOSS_ELBOW)
        sh_drop = _lerp_keys(t, _SRV_SH_DROP)

        hip_c = np.array([0.50, 0.52])
        # torso leans backward (toward -x for a right-hander) by `trunk` degrees
        neck = hip_c + _TORSO * _rot(up, -sign * trunk)
        sh_off = np.array([sign * shoulder_sep / 2.0, 0.0])
        sh_dom = neck + sh_off
        sh_non = neck - sh_off
        # drop the dominant shoulder during the trophy/cocking window
        sh_dom = sh_dom + np.array([0.0, sh_drop])

        # dominant arm: elbow at `hit_elev` from straight-up (rotated toward +x),
        # wrist bends to interior `hit_elbow`
        elbow_dir = _rot(up, sign * hit_elev)
        el_dom = sh_dom + _UPPER_ARM * elbow_dir
        wr_dom = el_dom + _FOREARM * _rot(-elbow_dir, sign * hit_elbow)

        # tossing arm: elbow at `toss_elev` from straight-up (toward -x),
        # near-straight interior `toss_elbow`
        toss_dir = _rot(up, -sign * toss_elev)
        el_non = sh_non + _UPPER_ARM * toss_dir
        wr_non = el_non + _FOREARM * _rot(-toss_dir, -sign * toss_elbow)

        # legs: symmetric, knee placed slightly forward, ankle gives interior knee_a
        knee_dir = _rot(up, 6.0)
        knee_pt = hip_c + _THIGH * knee_dir
        ankle_pt = knee_pt + _SHIN * _rot(-knee_dir, knee_a)

        head = neck + np.array([0.0, -0.10])
        hip_L = hip_c + np.array([-0.055, 0.0])
        hip_R = hip_c + np.array([0.055, 0.0])
        knee_L = knee_pt + np.array([-0.035, 0.0])
        knee_R = knee_pt + np.array([0.035, 0.0])
        ank_L = ankle_pt + np.array([-0.035, 0.0])
        ank_R = ankle_pt + np.array([0.035, 0.0])

        dom_is_left = dominant_side == "left"
        sh_L, sh_R = (sh_dom, sh_non) if dom_is_left else (sh_non, sh_dom)
        el_L, el_R = (el_dom, el_non) if dom_is_left else (el_non, el_dom)
        wr_L, wr_R = (wr_dom, wr_non) if dom_is_left else (wr_non, wr_dom)

        frame = {
            "nose": _p(head),
            "left_eye": _p(head + np.array([-0.02, -0.01])),
            "right_eye": _p(head + np.array([0.02, -0.01])),
            "left_ear": _p(head + np.array([-0.04, 0.0])),
            "right_ear": _p(head + np.array([0.04, 0.0])),
            "left_shoulder": _p(sh_L),
            "right_shoulder": _p(sh_R),
            "left_elbow": _p(el_L),
            "right_elbow": _p(el_R),
            "left_wrist": _p(wr_L),
            "right_wrist": _p(wr_R),
            "left_hip": _p(hip_L),
            "right_hip": _p(hip_R),
            "left_knee": _p(knee_L),
            "right_knee": _p(knee_R),
            "left_ankle": _p(ank_L),
            "right_ankle": _p(ank_R),
            "left_heel": _p(ank_L + np.array([-0.01, 0.03])),
            "right_heel": _p(ank_R + np.array([0.01, 0.03])),
            "left_foot": _p(ank_L + np.array([-0.05, 0.04])),
            "right_foot": _p(ank_R + np.array([0.05, 0.04])),
        }
        frames.append(frame)

    return frames


SERVE_SCENARIOS: dict[str, dict] = {
    "serve_good": dict(view="side", trophy_knee_deg=124.0),
    "serve_shallow_trophy": dict(view="side", trophy_knee_deg=165.0),
    "serve_truncated": dict(view="side", trophy_knee_deg=124.0, truncate_frac=0.45),
}
```

- [ ] **Step 4: Extend `gen_fixtures.py`**

In `backend/tests/gen_fixtures.py`, inside `main()`, after the basketball loop and before the `print`:

```python
    for name, kwargs in synth.SERVE_SCENARIOS.items():
        frames = synth.make_serve(n_frames=48, **kwargs)
        (OUT / f"{name}.json").write_text(json.dumps(_serialize(frames)))
    (OUT / "serve_no_pose.json").write_text(json.dumps(_serialize(synth.no_pose(30))))
```

Update the final `print` line to:

```python
    print("wrote", len(synth.SCENARIOS) + len(synth.SERVE_SCENARIOS) + 2, "fixtures to", OUT)
```

- [ ] **Step 5: Generate the fixtures**

Run: `cd backend && python -m tests.gen_fixtures`
Expected: prints `wrote 11 fixtures to .../tests/fixtures`. Confirm `serve_good.json`, `serve_shallow_trophy.json`, `serve_truncated.json`, `serve_no_pose.json` now exist.

- [ ] **Step 6: Add `SERVE_FIXTURE_NAMES` to `conftest.py`**

In `backend/tests/conftest.py`, right after the `FIXTURE_NAMES` list:

```python
SERVE_FIXTURE_NAMES = [
    "serve_good",
    "serve_shallow_trophy",
    "serve_truncated",
    "serve_no_pose",
]
```

Do NOT add these to `FIXTURE_NAMES` (that list feeds basketball-only parametrised tests).

- [ ] **Step 7: Run the full metrics + synth suites**

Run: `cd backend && python -m pytest tests/test_synth_serve.py tests/test_tennis_metrics.py -v`
Expected: all PASS (the three Task-1 tests that needed `make_serve` now run).

- [ ] **Step 8: Lint + commit**

```bash
cd backend && ruff check tests/
git add backend/tests/synth.py backend/tests/gen_fixtures.py backend/tests/conftest.py backend/tests/fixtures/serve_*.json backend/tests/test_synth_serve.py
git commit -m "test(tennis): deterministic synthetic serve fixture" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 3: Serve segmentation

**Files:**
- Create: `backend/analyzer/sports/tennis/phases.py`
- Test: `backend/tests/test_tennis_phases.py`

**Interfaces:**
- Consumes: `analyzer.camera.classify_camera_view(metrics: list) -> tuple[str, float]`. Metric dicts from `tennis.metrics._frame_metrics` (keys: `dominant_wrist_y`, `tossing_wrist_y`, `knee_angle`, `trunk_tilt`, `dominant_shoulder_y`, `torso_width`, `torso_height`, ...).
- Produces:
  - `PHASE_ORDER: list[str]` = `["stance", "toss", "trophy", "cocking", "contact", "follow_through"]`
  - `segment(metrics: list) -> dict` — `{"phases": {phase_key: int | None}, "camera_view": str, "confidence": float}`; `phases` has exactly the six `PHASE_ORDER` keys.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_tennis_phases.py`:

```python
from analyzer.sports.tennis.metrics import frame_metrics
from analyzer.sports.tennis.phases import PHASE_ORDER, segment
from tests import synth
from tests.conftest import load_fixture


def _seg(name):
    return segment(frame_metrics(load_fixture(name)))


def test_phase_keys_exact():
    assert set(_seg("serve_good")["phases"]) == set(PHASE_ORDER)


def test_all_six_phases_found_and_ordered_on_good_serve():
    p = _seg("serve_good")["phases"]
    idx = [p[k] for k in PHASE_ORDER]
    assert all(v is not None for v in idx)
    assert idx == sorted(idx)
    assert len(set(idx)) == len(idx)


def test_contact_is_dominant_wrist_peak():
    m = frame_metrics(load_fixture("serve_good"))
    p = segment(m)["phases"]
    peak = min(range(len(m)), key=lambda i: m[i]["dominant_wrist_y"])
    assert p["contact"] == peak


def test_toss_is_tossing_wrist_peak_before_contact():
    m = frame_metrics(load_fixture("serve_good"))
    p = segment(m)["phases"]
    peak = min((i for i in range(len(m)) if i <= p["contact"]),
               key=lambda i: m[i]["tossing_wrist_y"])
    assert p["toss"] == peak


def test_trophy_is_deepest_knee_between_toss_and_contact():
    m = frame_metrics(load_fixture("serve_good"))
    p = segment(m)["phases"]
    window = [i for i in range(len(m)) if p["toss"] < i < p["contact"]]
    assert p["trophy"] == min(window, key=lambda i: m[i]["knee_angle"])


def test_camera_view_forwarded():
    seg = _seg("serve_good")
    assert seg["camera_view"] in {"side", "oblique", "front"}
    assert 0.0 <= seg["confidence"] <= 1.0


def test_too_few_valid_frames_all_none():
    m = frame_metrics(load_fixture("serve_no_pose"))
    p = segment(m)["phases"]
    assert all(v is None for v in p.values())


def test_truncated_serve_has_no_late_phases():
    p = _seg("serve_truncated")["phases"]
    assert p["stance"] is not None
    assert p["toss"] is not None
    assert p["trophy"] is not None
    assert p["cocking"] is None
    assert p["contact"] is None
    assert p["follow_through"] is None


def test_none_metrics_do_not_break_segmentation():
    m = frame_metrics(load_fixture("serve_good"))
    m[0] = None
    m[-1] = None
    p = segment(m)["phases"]
    assert set(p) == set(PHASE_ORDER)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_tennis_phases.py -v`
Expected: FAIL — `ModuleNotFoundError: analyzer.sports.tennis.phases`.

- [ ] **Step 3: Implement `phases.py`**

`backend/analyzer/sports/tennis/phases.py`:

```python
"""Locate the six serve phases in a metric sequence by landmark extrema.

Same shape as basketball's segmenter: collect valid (index, metric) pairs,
forward the shared camera-view classifier, and return one frame index (or
None) per phase key.

Imports: analyzer.camera only (core-purity constraint).
"""
from analyzer.camera import classify_camera_view

PHASE_ORDER = ["stance", "toss", "trophy", "cocking", "contact", "follow_through"]

_MIN_VALID = 6
_STANCE_KNEE_SLACK = 15.0


def _valid(metrics: list) -> list:
    return [(i, m) for i, m in enumerate(metrics) if m is not None]


def segment(metrics: list) -> dict:
    valid = _valid(metrics)
    view, confidence = classify_camera_view(metrics)
    none_phases = {k: None for k in PHASE_ORDER}

    if len(valid) < _MIN_VALID:
        return {"phases": none_phases, "camera_view": view, "confidence": confidence}

    # 1. contact = hitting hand at its highest (smallest y) over the whole clip
    contact_idx = min(valid, key=lambda x: x[1]["dominant_wrist_y"])[0]

    # 2. toss = tossing hand at its highest, at or before contact
    before_contact = [(i, m) for i, m in valid if i <= contact_idx]
    toss_idx = min(before_contact, key=lambda x: x[1]["tossing_wrist_y"])[0]

    # 3. trophy = deepest knee bend strictly between toss and contact
    trophy_window = [(i, m) for i, m in valid if toss_idx < i < contact_idx]
    trophy_idx = (
        min(trophy_window, key=lambda x: x[1]["knee_angle"])[0]
        if trophy_window
        else toss_idx
    )

    # 4. cocking = peak trunk tilt strictly between trophy and contact
    cocking_window = [(i, m) for i, m in valid if trophy_idx < i < contact_idx]
    cocking_idx = (
        max(cocking_window, key=lambda x: x[1]["trunk_tilt"])[0]
        if cocking_window
        else None
    )

    # 5. stance = most upright frame before the toss starts
    pre_toss = [(i, m) for i, m in valid if i < toss_idx]
    if pre_toss:
        max_knee = max(m["knee_angle"] for _, m in pre_toss)
        upright = [i for i, m in pre_toss if m["knee_angle"] >= max_knee - _STANCE_KNEE_SLACK]
        stance_idx = upright[-1] if upright else pre_toss[0][0]
    else:
        stance_idx = valid[0][0]

    # 6. follow_through = last frame after contact with the hitting hand
    #    dropped below the dominant shoulder
    post = [(i, m) for i, m in valid if i > contact_idx]
    dropped = [i for i, m in post if m["dominant_wrist_y"] > m["dominant_shoulder_y"]]
    if dropped:
        follow_idx = dropped[-1]
    elif post:
        follow_idx = post[-1][0]
    else:
        follow_idx = None

    # truncation: a clip ending at/before contact has no distinct later phases
    if contact_idx <= trophy_idx:
        contact_idx = None
        cocking_idx = None
        follow_idx = None
    if follow_idx is not None and follow_idx <= (contact_idx or trophy_idx):
        follow_idx = None

    return {
        "phases": {
            "stance": stance_idx,
            "toss": toss_idx,
            "trophy": trophy_idx,
            "cocking": cocking_idx,
            "contact": contact_idx,
            "follow_through": follow_idx,
        },
        "camera_view": view,
        "confidence": confidence,
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_tennis_phases.py -v`
Expected: all PASS. If `test_truncated_serve_has_no_late_phases` fails because `serve_truncated` still finds a `contact`, adjust `SERVE_SCENARIOS["serve_truncated"]["truncate_frac"]` down to `0.42` in `synth.py`, regenerate fixtures (`python -m tests.gen_fixtures`), re-run. Record the change in the ledger.

- [ ] **Step 5: Lint + commit**

```bash
cd backend && ruff check analyzer/sports/tennis/phases.py
git add backend/analyzer/sports/tennis/phases.py backend/tests/test_tennis_phases.py
git commit -m "feat(tennis): six-phase serve segmentation" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 4: Serve scoring, ideals, and feedback

**Files:**
- Create: `backend/analyzer/sports/tennis/scoring.py`
- Test: `backend/tests/test_tennis_scoring.py`

**Interfaces:**
- Consumes: `analyzer.scoring_curve.score_metric(value, lo, hi, falloff) -> float`. `analyzer.sports.tennis.phases.PHASE_ORDER`. Phase-metric dicts from `tennis.metrics` (or `None`).
- Produces:
  - `IDEALS: dict[str, dict[str, dict]]` — `{phase: {metric: {"lo", "hi", "falloff"}}}`
  - `PHASE_INFO: dict[str, dict]` — `{phase: {"emoji", "title", "description"}}`
  - `PHASE_RESOURCES: dict[str, list[dict]]` — `{phase: [{"label", "url"}, ...]}`
  - `generate_feedback(phase: str, metrics: dict) -> tuple[str, str]` — `(text, status)`, status ∈ `{"good", "warning", "error"}`
  - `score(phase_metrics: dict) -> dict` — `{"overall_score": float, "priority": str, "phases": {phase: {**info, "score", "status", "feedback", "resources", "angles_measured"}}}`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_tennis_scoring.py`:

```python
from analyzer.sports.tennis.metrics import frame_metrics
from analyzer.sports.tennis.phases import PHASE_ORDER, segment
from analyzer.sports.tennis.scoring import (
    IDEALS,
    PHASE_INFO,
    PHASE_RESOURCES,
    generate_feedback,
    score,
)
from tests.conftest import load_fixture


def _analyze(name):
    m = frame_metrics(load_fixture(name))
    seg = segment(m)
    pm = {}
    for p in PHASE_ORDER:
        idx = seg["phases"].get(p)
        pm[p] = m[idx] if idx is not None and m[idx] is not None else None
    return score(pm)


def test_config_covers_every_phase():
    assert set(IDEALS) == set(PHASE_ORDER)
    assert set(PHASE_INFO) == set(PHASE_ORDER)
    assert set(PHASE_RESOURCES) == set(PHASE_ORDER)
    for phase in PHASE_ORDER:
        assert len(PHASE_RESOURCES[phase]) == 2
        for r in PHASE_RESOURCES[phase]:
            assert set(r) == {"label", "url"}
            assert r["url"].startswith("https://")


def test_score_shape():
    result = _analyze("serve_good")
    assert set(result) == {"overall_score", "priority", "phases"}
    assert set(result["phases"]) == set(PHASE_ORDER)
    assert result["priority"] in PHASE_ORDER
    for block in result["phases"].values():
        assert set(block) >= {
            "emoji", "title", "description", "score", "status", "feedback",
            "resources", "angles_measured",
        }


def test_good_serve_scores_reasonably():
    assert _analyze("serve_good")["overall_score"] >= 70


def test_shallow_trophy_scores_below_good_at_trophy():
    good = _analyze("serve_good")["phases"]["trophy"]["score"]
    shallow = _analyze("serve_shallow_trophy")["phases"]["trophy"]["score"]
    assert shallow < good


def test_missing_phase_is_unavailable():
    result = score({k: None for k in PHASE_ORDER})
    assert result["overall_score"] == 0
    for block in result["phases"].values():
        assert block["score"] == 0
        assert block["status"] == "unavailable"
        assert block["angles_measured"] == {}


def test_angle_unit_suffix_rules():
    result = _analyze("serve_good")
    measured = result["phases"]["contact"]["angles_measured"]
    assert "hitting_elbow_angle" in measured
    assert measured["hitting_elbow_angle"]["ideal"].endswith("°")
    assert not measured["contact_reach"]["ideal"].endswith("°")


def test_priority_is_lowest_scoring_phase():
    result = _analyze("serve_shallow_trophy")
    lowest = min(result["phases"].items(), key=lambda kv: kv[1]["score"])[0]
    assert result["priority"] == lowest


def test_generate_feedback_returns_status_triple():
    for phase in PHASE_ORDER:
        text, status = generate_feedback(phase, {})
        assert isinstance(text, str) and text
        assert status in {"good", "warning", "error"}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_tennis_scoring.py -v`
Expected: FAIL — `ModuleNotFoundError: analyzer.sports.tennis.scoring`.

- [ ] **Step 3: Implement `scoring.py`**

`backend/analyzer/sports/tennis/scoring.py`:

```python
"""Score each serve phase against literature-derived ideal bands.

Bands adapted from the 8-stage serve model of Kovacs & Ellenbecker
("An 8-Stage Model for Evaluating the Tennis Serve", Sports Health, 2011)
and ITF / USTA coaching biomechanics, restricted to what MediaPipe Pose
recovers from a side view and tuned for a recreational-player target rather
than tour-level extremes. No dataset exists; these are a first cut and are
expected to be revised once real serve clips run through the pipeline.

Imports: analyzer.scoring_curve + analyzer.sports.tennis.phases only.
"""
from analyzer.scoring_curve import score_metric
from analyzer.sports.tennis.phases import PHASE_ORDER

# phase -> metric -> band. See module docstring for rationale.
IDEALS: dict[str, dict[str, dict]] = {
    "stance": {
        "knee_angle": {"lo": 155.0, "hi": 178.0, "falloff": 25.0},
        "trunk_tilt": {"lo": 0.0, "hi": 12.0, "falloff": 15.0},
    },
    "toss": {
        "tossing_arm_angle": {"lo": 155.0, "hi": 180.0, "falloff": 25.0},
        "contact_reach": {"lo": -0.30, "hi": -0.05, "falloff": 0.15},
    },
    "trophy": {
        "knee_angle": {"lo": 110.0, "hi": 140.0, "falloff": 25.0},
        "hitting_elbow_angle": {"lo": 80.0, "hi": 120.0, "falloff": 30.0},
        "shoulder_tilt": {"lo": 0.03, "hi": 0.12, "falloff": 0.10},
    },
    "cocking": {
        "trunk_tilt": {"lo": 10.0, "hi": 28.0, "falloff": 15.0},
        "shoulder_hip_separation": {"lo": 15.0, "hi": 45.0, "falloff": 25.0},
        "knee_angle": {"lo": 130.0, "hi": 165.0, "falloff": 25.0},
    },
    "contact": {
        "hitting_elbow_angle": {"lo": 150.0, "hi": 180.0, "falloff": 25.0},
        "dominant_arm_elevation": {"lo": 0.0, "hi": 22.0, "falloff": 20.0},
        "contact_reach": {"lo": -0.42, "hi": -0.15, "falloff": 0.15},
        "knee_angle": {"lo": 160.0, "hi": 180.0, "falloff": 20.0},
    },
    "follow_through": {
        "hitting_elbow_angle": {"lo": 30.0, "hi": 90.0, "falloff": 40.0},
    },
}

PHASE_INFO = {
    "stance": {"emoji": "🎾", "title": "Stance",
               "description": "Balanced start, weight ready to load"},
    "toss": {"emoji": "🖐️", "title": "Ball Toss",
             "description": "Tossing arm extended, release up and slightly forward"},
    "trophy": {"emoji": "🏆", "title": "Trophy Pose",
               "description": "Loaded legs, hitting arm cocked back"},
    "cocking": {"emoji": "🏹", "title": "Racket Drop",
                "description": "Peak trunk tilt and shoulder-over-shoulder"},
    "contact": {"emoji": "💥", "title": "Contact",
                "description": "Full extension up to the hitting hand's peak"},
    "follow_through": {"emoji": "🎯", "title": "Follow Through",
                       "description": "Deceleration down and across the body"},
}

_WIKI = "https://en.wikipedia.org/wiki/Serve_(tennis)"
_USTA = "https://www.usta.com/en/home/improve/tips-and-instruction.html"
_ITF = "https://www.itftennis.com/en/growing-the-game/coaching/"

PHASE_RESOURCES = {
    "stance": [
        {"label": "The serve: stance and setup", "url": _WIKI},
        {"label": "USTA tips & instruction", "url": _USTA},
    ],
    "toss": [
        {"label": "The serve: the toss", "url": _WIKI},
        {"label": "USTA tips & instruction", "url": _USTA},
    ],
    "trophy": [
        {"label": "The serve: trophy position", "url": _WIKI},
        {"label": "ITF coaching resources", "url": _ITF},
    ],
    "cocking": [
        {"label": "The serve: racket drop", "url": _WIKI},
        {"label": "ITF coaching resources", "url": _ITF},
    ],
    "contact": [
        {"label": "The serve: the hit", "url": _WIKI},
        {"label": "USTA tips & instruction", "url": _USTA},
    ],
    "follow_through": [
        {"label": "The serve: follow-through", "url": _WIKI},
        {"label": "USTA tips & instruction", "url": _USTA},
    ],
}

_ANGLE_HINTS = ("angle", "tilt", "elevation", "separation")


def _ideal_str(metric: str, band: dict) -> str:
    suffix = "°" if any(h in metric for h in _ANGLE_HINTS) else ""
    return f"{band['lo']:g}–{band['hi']:g}{suffix}"


def generate_feedback(phase: str, metrics: dict) -> tuple[str, str]:
    if phase == "stance":
        tilt = metrics.get("trunk_tilt", 5.0)
        if tilt > 18.0:
            return (f"Leaning back too early ({tilt:.0f}°) — start tall and balanced.", "warning")
        return ("Balanced, upright stance — a stable base to load from.", "good")

    if phase == "toss":
        arm = metrics.get("tossing_arm_angle", 170.0)
        reach = metrics.get("contact_reach", -0.15)
        if arm < 150.0:
            return (f"Tossing arm bent ({arm:.0f}°) — keep it straight and lift, don't throw.", "error")
        if reach > -0.03:
            return ("Toss is landing low — release higher so you hit at full stretch.", "warning")
        return ("Smooth toss with a straight arm — good height to hit at full reach.", "good")

    if phase == "trophy":
        knee = metrics.get("knee_angle", 125.0)
        elbow = metrics.get("hitting_elbow_angle", 100.0)
        lo, hi = IDEALS["trophy"]["knee_angle"]["lo"], IDEALS["trophy"]["knee_angle"]["hi"]
        if knee > hi + 10:
            return (f"Legs barely loaded ({knee:.0f}°) — bend to {lo:.0f}–{hi:.0f}° to drive up.", "error")
        if elbow > 135.0:
            return (f"Hitting arm too open ({elbow:.0f}°) — keep the elbow bent and cocked back.", "warning")
        return (f"Strong trophy pose — legs loaded ({knee:.0f}°) and arm cocked.", "good")

    if phase == "cocking":
        tilt = metrics.get("trunk_tilt", 20.0)
        sep = metrics.get("shoulder_hip_separation", 25.0)
        if tilt < 8.0:
            return (f"Little upper-body coil ({tilt:.0f}°) — let the shoulders tilt back into the drop.", "warning")
        if sep < 12.0:
            return ("Shoulders and hips turning together — separate them to store more power.", "warning")
        return (f"Good racket drop — trunk tilted ({tilt:.0f}°) with shoulder-over-shoulder.", "good")

    if phase == "contact":
        elbow = metrics.get("hitting_elbow_angle", 165.0)
        elev = metrics.get("dominant_arm_elevation", 12.0)
        if elbow < 150.0:
            return (f"Not fully extended at contact ({elbow:.0f}°) — reach up and snap through.", "error")
        if elev > 30.0:
            return (f"Contact point is out to the side ({elev:.0f}° off vertical) — hit more overhead.", "warning")
        return (f"Full extension at contact ({elbow:.0f}°) — reaching up to the peak.", "good")

    if phase == "follow_through":
        elbow = metrics.get("hitting_elbow_angle", 60.0)
        if elbow > 120.0:
            return ("Arm still stiff after contact — let it decelerate down and across your body.", "warning")
        return ("Relaxed deceleration across the body — a complete, balanced finish.", "good")

    return ("Analysis unavailable for this phase.", "warning")


def score(phase_metrics: dict) -> dict:
    results: dict[str, dict] = {}
    all_scores: list[float] = []

    for phase in PHASE_ORDER:
        metrics = phase_metrics.get(phase)
        info = PHASE_INFO[phase]
        resources = PHASE_RESOURCES[phase]

        if metrics is None:
            results[phase] = {
                **info,
                "score": 0,
                "status": "unavailable",
                "feedback": "Could not detect this phase — film the whole serve "
                            "from the side with your full body in frame.",
                "resources": resources,
                "angles_measured": {},
            }
            continue

        phase_scores: list[float] = []
        angles_measured: dict[str, dict] = {}
        for metric, band in IDEALS[phase].items():
            val = metrics.get(metric)
            if val is None:
                continue
            s = score_metric(val, band["lo"], band["hi"], band["falloff"])
            phase_scores.append(s)
            angles_measured[metric] = {
                "value": round(val, 2),
                "ideal": _ideal_str(metric, band),
                "score": s,
            }

        phase_score = round(sum(phase_scores) / len(phase_scores), 1) if phase_scores else 0
        all_scores.append(phase_score)
        feedback_text, status = generate_feedback(phase, metrics)
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

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_tennis_scoring.py -v`
Expected: all PASS. If `test_good_serve_scores_reasonably` fails (overall < 70), the synthetic serve's metrics are landing outside the bands — inspect `_analyze("serve_good")["phases"]` per-phase `angles_measured`, and adjust the `synth.make_serve` keyframe tables (`_SRV_*` in `synth.py`) so a "good" serve sits mid-band, then regenerate fixtures and re-run Tasks 2–4's tests. Prefer moving the synthetic pose, not the bands. Record any band change in the ledger with rationale.

- [ ] **Step 5: Lint + commit**

```bash
cd backend && ruff check analyzer/sports/tennis/scoring.py
git add backend/analyzer/sports/tennis/scoring.py backend/tests/test_tennis_scoring.py
git commit -m "feat(tennis): serve scoring, ideal bands, and feedback" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 5: Serve ideal-frame rendering

**Files:**
- Create: `backend/analyzer/sports/tennis/rendering.py`
- Test: `backend/tests/test_tennis_rendering_smoke.py`

**Interfaces:**
- Consumes: `analyzer.skeleton.generate_pose_gif(frames, angles_list) -> str`, `analyzer.skeleton.extract_phase_frame_b64(frame_data, angles, phase, size) -> tuple[str, str]` — WAIT: those live in `analyzer.sports.basketball.rendering`, not `analyzer.skeleton`. Re-check before implementing: `grep -n "def generate_pose_gif\|def extract_phase_frame_b64" backend/analyzer/skeleton.py backend/analyzer/sports/basketball/rendering.py`. As of writing, `skeleton.py` holds only `SKELETON_CONNECTIONS` and `get_joint_color`; `generate_pose_gif` and `extract_phase_frame_b64` are in `basketball/rendering.py`. **Do not import from `basketball/`** (cross-plugin coupling). Instead, tennis `rendering.py` carries its own thin `generate_pose_gif` / `extract_phase_frame_b64` copies (they are ~40 lines total and already "copied verbatim from legacy" per the basketball file's own docstring), OR — preferred — this task first lifts `generate_pose_gif`, `extract_phase_frame_b64`, and `draw_skeleton_on_frame` into `analyzer/skeleton.py` as shared code and re-points `basketball/rendering.py` at them. Pick the lift: it is what sub-project A's spec already intended ("`analyzer/skeleton.py` # generate_pose_gif, draw_skeleton_on_frame, ... extract_phase_frame_b64"). See Step 3.
- Produces:
  - `render_all(frames: list, metrics: list, phases: dict, phase_metrics: dict) -> dict` — `{"pose_gif": str, "phase_images": {phase_key: {"user_frame": str, "ideal_frame": str}}}` with keys = `PHASE_ORDER`.
  - `draw_ideal_skeleton(phase: str, metrics: dict, size: tuple[int, int] = (460, 460)) -> np.ndarray` — BGR image.
  - `_IDEAL_PROFILE: dict[str, dict[str, tuple[float, float]]]`, `_IDEAL_PHASE: dict[str, tuple]`.

- [ ] **Step 1: Write the failing smoke tests**

`backend/tests/test_tennis_rendering_smoke.py`:

```python
import numpy as np

from analyzer.sports.tennis.metrics import frame_metrics
from analyzer.sports.tennis.phases import PHASE_ORDER, segment
from analyzer.sports.tennis.rendering import draw_ideal_skeleton, render_all
from tests import synth


def _raw(n=48):
    out = []
    for f in synth.make_serve(n_frames=n):
        f = dict(f)
        f["_frame"] = np.zeros((120, 120, 3), dtype=np.uint8)
        f["_raw_landmarks"] = None
        out.append(f)
    return out


def _pm(metrics, phases):
    return {p: (metrics[phases[p]] if phases.get(p) is not None else None)
            for p in PHASE_ORDER}


def test_draw_ideal_skeleton_every_phase():
    for phase in PHASE_ORDER:
        img = draw_ideal_skeleton(phase, {"hitting_elbow_angle": 165.0})
        assert isinstance(img, np.ndarray)
        assert img.shape == (460, 460, 3)
        assert img.dtype == np.uint8


def test_draw_ideal_skeleton_unknown_phase_falls_back():
    img = draw_ideal_skeleton("nonsense", {})
    assert img.shape == (460, 460, 3)


def test_render_all_shape():
    frames = _raw()
    m = frame_metrics(frames)
    seg = segment(m)
    out = render_all(frames, m, seg["phases"], _pm(m, seg["phases"]))
    assert set(out) == {"pose_gif", "phase_images"}
    assert set(out["phase_images"]) == set(PHASE_ORDER)
    for pair in out["phase_images"].values():
        assert set(pair) == {"user_frame", "ideal_frame"}
        assert isinstance(pair["user_frame"], str)
        assert isinstance(pair["ideal_frame"], str)
    assert any(p["ideal_frame"] for p in out["phase_images"].values())


def test_render_all_tolerates_none_phase():
    frames = _raw()
    m = frame_metrics(frames)
    seg = segment(m)
    phases = dict(seg["phases"])
    phases["cocking"] = None
    out = render_all(frames, m, phases, _pm(m, phases))
    assert out["phase_images"]["cocking"]["user_frame"] == ""
    assert out["phase_images"]["cocking"]["ideal_frame"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_tennis_rendering_smoke.py -v`
Expected: FAIL — `ModuleNotFoundError: analyzer.sports.tennis.rendering`.

- [ ] **Step 3: Lift shared drawing into `analyzer/skeleton.py`**

Move `draw_skeleton_on_frame`, `generate_pose_gif`, and `extract_phase_frame_b64` from `backend/analyzer/sports/basketball/rendering.py` into `backend/analyzer/skeleton.py` **unchanged**, with two adjustments:
- `extract_phase_frame_b64` currently calls the module-local `draw_ideal_skeleton`. Parametrise it: add a keyword `draw_ideal` (a callable `(phase, angles, size) -> np.ndarray`); when `angles` is truthy call `draw_ideal(phase, angles, size)`, else the zero image. Signature: `extract_phase_frame_b64(frame_data, angles, phase, size=(460, 460), *, draw_ideal=None)` — when `draw_ideal is None` and `angles` is truthy, use the zero image (no overlay).
- `skeleton.py` gains `import base64, io`, `import cv2`, `import numpy as np`, `from PIL import Image`. `skeleton.py` is already exempt from core purity (it is an image module in `test_core_purity.py`'s implicit exemption — verify: it IS listed in `CORE`. It currently only has stdlib-free consts. Adding cv2/PIL to it WOULD break `test_core_purity`). **Therefore:** remove `skeleton.py` from the `CORE` list in `test_core_purity.py` as part of this step, matching how `sports/*/rendering.py` are treated (image modules). Add a one-line comment in the test: `# skeleton.py draws frames (cv2/PIL) — exempt like sports/*/rendering.py`.

In `backend/analyzer/sports/basketball/rendering.py`:
- Replace the three moved function bodies with `from analyzer.skeleton import draw_skeleton_on_frame, generate_pose_gif, extract_phase_frame_b64` (keep `draw_ideal_skeleton`, `IDEAL_RANGES`, `_IDEAL_PROFILE`, `_IDEAL_PHASE`, `render_phase_images`, `render_all` local).
- `render_phase_images` / `extract_phase_frame_b64` call sites: pass `draw_ideal=draw_ideal_skeleton` so basketball keeps its overlay.

Run the basketball rendering + golden smoke tests to confirm no behaviour change:

Run: `cd backend && python -m pytest tests/test_rendering_smoke.py tests/test_pipeline_golden.py tests/test_no_regression.py tests/test_basketball_plugin.py -v`
Expected: all PASS unchanged.

- [ ] **Step 4: Implement `tennis/rendering.py`**

`backend/analyzer/sports/tennis/rendering.py`:

```python
"""Serve ideal-frame overlays. Side-profile reference pose per phase in the
app palette, mirroring the basketball ideal frame. cv2/PIL live here only.
"""
import cv2
import numpy as np

from analyzer.skeleton import extract_phase_frame_b64, generate_pose_gif
from analyzer.sports.tennis.phases import PHASE_ORDER

# App palette (BGR).
_BG = (28, 21, 17)          # #11151C
_STRIP = (64, 45, 33)       # #212D40
_STEEL = (125, 107, 90)
_KEY = (83, 104, 214)       # #D66853 terracotta
_INK_TEXT = (245, 240, 235)
_MUTED_TEXT = (170, 155, 140)
_GOOD = (110, 190, 100)

# Side-profile reference pose per phase (normalised x,y; figure faces +x).
# `toss_wrist` is the tossing hand; `wrist` is the hitting hand.
_IDEAL_PROFILE = {
    "stance": {
        "head": (0.50, 0.13), "shoulder": (0.49, 0.26), "elbow": (0.47, 0.40),
        "wrist": (0.49, 0.52), "toss_wrist": (0.45, 0.52), "hip": (0.50, 0.50),
        "knee": (0.51, 0.69), "ankle": (0.50, 0.86), "toe": (0.57, 0.88),
    },
    "toss": {
        "head": (0.49, 0.14), "shoulder": (0.48, 0.27), "elbow": (0.45, 0.38),
        "wrist": (0.44, 0.50), "toss_wrist": (0.55, 0.06), "hip": (0.50, 0.51),
        "knee": (0.52, 0.68), "ankle": (0.50, 0.86), "toe": (0.57, 0.88),
    },
    "trophy": {
        "head": (0.47, 0.16), "shoulder": (0.45, 0.29), "elbow": (0.40, 0.24),
        "wrist": (0.36, 0.14), "toss_wrist": (0.60, 0.10), "hip": (0.51, 0.52),
        "knee": (0.60, 0.64), "ankle": (0.49, 0.85), "toe": (0.57, 0.87),
    },
    "cocking": {
        "head": (0.44, 0.18), "shoulder": (0.43, 0.30), "elbow": (0.36, 0.34),
        "wrist": (0.30, 0.46), "toss_wrist": (0.56, 0.30), "hip": (0.52, 0.52),
        "knee": (0.58, 0.66), "ankle": (0.49, 0.85), "toe": (0.57, 0.87),
    },
    "contact": {
        "head": (0.49, 0.16), "shoulder": (0.49, 0.27), "elbow": (0.51, 0.13),
        "wrist": (0.53, 0.01), "toss_wrist": (0.44, 0.40), "hip": (0.49, 0.51),
        "knee": (0.49, 0.71), "ankle": (0.48, 0.86), "toe": (0.55, 0.89),
    },
    "follow_through": {
        "head": (0.49, 0.17), "shoulder": (0.49, 0.28), "elbow": (0.44, 0.34),
        "wrist": (0.36, 0.52), "toss_wrist": (0.46, 0.44), "hip": (0.50, 0.52),
        "knee": (0.51, 0.71), "ankle": (0.49, 0.87), "toe": (0.56, 0.89),
    },
}
_PROFILE_BONES = [
    ("head", "shoulder"), ("shoulder", "elbow"), ("elbow", "wrist"),
    ("shoulder", "toss_wrist"), ("shoulder", "hip"), ("hip", "knee"),
    ("knee", "ankle"), ("ankle", "toe"),
]
# title, one-line cue, (metric key, label, (lo, hi)), key joints
_IDEAL_PHASE = {
    "stance": ("Stance", "Stand tall - weight balanced",
               ("knee_angle", "Knee", (155, 178)), {"knee", "hip"}),
    "toss": ("Ball Toss", "Straight arm - lift, don't throw",
             ("tossing_arm_angle", "Toss arm", (155, 180)), {"toss_wrist", "shoulder"}),
    "trophy": ("Trophy Pose", "Legs loaded, elbow cocked back",
               ("knee_angle", "Knee", (110, 140)), {"knee", "hip", "elbow"}),
    "cocking": ("Racket Drop", "Tilt back - shoulder over shoulder",
                ("trunk_tilt", "Trunk", (10, 28)), {"shoulder", "hip", "elbow"}),
    "contact": ("Contact", "Full reach - hit at the peak",
                ("hitting_elbow_angle", "Elbow", (150, 180)), {"elbow", "wrist", "shoulder"}),
    "follow_through": ("Follow Through", "Decelerate down and across",
                       ("hitting_elbow_angle", "Elbow", (30, 90)), {"elbow", "wrist"}),
}


def draw_ideal_skeleton(phase: str, metrics: dict, size: tuple[int, int] = (460, 460)) -> np.ndarray:
    w, h = size
    img = np.full((h, w, 3), _BG, dtype=np.uint8)

    pose = _IDEAL_PROFILE.get(phase, _IDEAL_PROFILE["trophy"])
    title, cue, (metric_key, metric_label, (lo, hi)), key = _IDEAL_PHASE.get(
        phase, _IDEAL_PHASE["trophy"]
    )
    px = {name: (int(x * w), int(y * h)) for name, (x, y) in pose.items()}

    floor_y = int(0.90 * h)
    cv2.line(img, (int(0.12 * w), floor_y), (int(0.88 * w), floor_y), _STRIP, 3, cv2.LINE_AA)

    for a, b in _PROFILE_BONES:
        col = _KEY if (a in key and b in key) else _STEEL
        cv2.line(img, px[a], px[b], col, 8, cv2.LINE_AA)
    for name, (x, y) in px.items():
        if name == "head":
            cv2.circle(img, (x, y), 16, _STEEL, 3, cv2.LINE_AA)
            continue
        col = _KEY if name in key else _STEEL
        r = 11 if name in key else 8
        cv2.circle(img, (x, y), r, col, -1, cv2.LINE_AA)
        cv2.circle(img, (x, y), r, _BG, 2, cv2.LINE_AA)

    # ball at the tossing hand
    bx0, by0 = px["toss_wrist"]
    cv2.circle(img, (bx0, by0), 13, _INK_TEXT, 2, cv2.LINE_AA)

    cv2.rectangle(img, (0, 0), (w, 40), _STRIP, -1)
    cv2.putText(img, f"IDEAL - {title}", (14, 27),
                cv2.FONT_HERSHEY_DUPLEX, 0.62, _INK_TEXT, 1, cv2.LINE_AA)

    measured = metrics.get(metric_key) if metrics else None
    unit = "" if metric_key == "contact_reach" else "deg"
    bx = w - 176
    cv2.rectangle(img, (bx, 52), (w - 12, 108 if measured is not None else 82), _STRIP, -1)
    cv2.putText(img, f"{metric_label} {lo}-{hi}{unit}", (bx + 12, 74),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, _MUTED_TEXT, 1, cv2.LINE_AA)
    if measured is not None:
        ok = lo <= measured <= hi
        cv2.putText(img, f"You {round(measured)}{unit}", (bx + 12, 98),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, _GOOD if ok else _KEY, 1, cv2.LINE_AA)

    cv2.rectangle(img, (0, h - 44), (w, h), _STRIP, -1)
    cv2.putText(img, cue, (14, h - 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.56, _INK_TEXT, 1, cv2.LINE_AA)
    return img


def render_phase_images(frames, metrics, phases, phase_metrics, size=(460, 460)):
    by_index = {i: f for i, f in enumerate(frames)}
    out = {}
    for phase in PHASE_ORDER:
        idx = phases.get(phase)
        frame_data = by_index.get(idx) if idx is not None else None
        angles = phase_metrics.get(phase)
        user_b64, ideal_b64 = extract_phase_frame_b64(
            frame_data, angles, phase, size=size, draw_ideal=draw_ideal_skeleton
        )
        out[phase] = {"user_frame": user_b64, "ideal_frame": ideal_b64}
    return out


def render_all(frames: list, metrics: list, phases: dict, phase_metrics: dict) -> dict:
    return {
        "pose_gif": generate_pose_gif(frames, metrics),
        "phase_images": render_phase_images(frames, metrics, phases, phase_metrics),
    }
```

Note: `extract_phase_frame_b64` builds the "You" frame with `draw_skeleton_on_frame`, which reads basketball-specific keys like `shooting_side` from `angles`. Tennis metric dicts lack those; `draw_skeleton_on_frame` already `.get(...)`s with defaults (`angles.get("shooting_side", "right")`, `IDEAL_RANGES.get(phase, {})` → `{}` for tennis phase names), so it degrades to a plain grey skeleton with a phase-name caption. Acceptable for now; a tennis-tuned "You" overlay is a later polish. The synthetic fixtures carry `_raw_landmarks=None`, so in tests the user frame is `""` regardless.

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_tennis_rendering_smoke.py -v`
Expected: all PASS.

- [ ] **Step 6: Lint + commit**

```bash
cd backend && ruff check analyzer/ tests/
git add backend/analyzer/skeleton.py backend/analyzer/sports/basketball/rendering.py backend/analyzer/sports/tennis/rendering.py backend/tests/test_tennis_rendering_smoke.py backend/tests/test_core_purity.py
git commit -m "feat(tennis): serve ideal-frame rendering; lift shared drawing into skeleton.py" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

### Task 6: Register the plugin and wire the tests

**Files:**
- Modify: `backend/analyzer/sports/tennis/__init__.py` (replace marker with `TennisPlugin`)
- Modify: `backend/analyzer/registry.py`
- Modify: `backend/tests/test_core_purity.py` (add tennis modules to `CORE`)
- Modify: `backend/tests/test_registry.py`
- Modify: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `analyzer.sports.base.SportPlugin` (attrs `name, display_name, motion, phase_order`; abstract `frame_metrics`, `segment`, `score`; `render` has a default). `tennis.metrics.frame_metrics`, `tennis.phases.segment` + `PHASE_ORDER`, `tennis.scoring.score`, `tennis.rendering.render_all`.
- Produces: `TennisPlugin` exported from `analyzer.sports.tennis`; `registry.SPORTS["tennis"]`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_registry.py`:

```python
def test_tennis_registered():
    p = get_plugin("tennis")
    assert p.name == "tennis"
    assert p.display_name == "Tennis"
    assert p.motion == "serve"
    assert p.phase_order == ["stance", "toss", "trophy", "cocking", "contact", "follow_through"]


def test_list_sports_includes_both():
    names = [r["name"] for r in list_sports()]
    assert names == ["basketball", "tennis"]
```

Add to `backend/tests/test_api.py` — a tennis-aware client fixture and a routing test:

```python
@pytest.fixture
def tennis_client(monkeypatch):
    from analyzer import pose
    from analyzer.sports.tennis import rendering as t_rendering

    raw = []
    for f in synth.make_serve(n_frames=48):
        f = dict(f)
        f["_frame"] = None
        f["_raw_landmarks"] = None
        raw.append(f)

    monkeypatch.setattr(pose, "extract_landmarks_from_video", lambda _p: raw)
    monkeypatch.setattr(t_rendering, "generate_pose_gif", lambda *a, **k: "")
    monkeypatch.setattr(
        t_rendering, "render_phase_images",
        lambda *a, **k: {p: {"user_frame": "", "ideal_frame": ""} for p in
                         ["stance", "toss", "trophy", "cocking", "contact", "follow_through"]},
    )
    import main
    return TestClient(main.app)


def test_sports_lists_tennis(tennis_client):
    rows = tennis_client.get("/sports").json()
    t = next(r for r in rows if r["name"] == "tennis")
    assert t["motion"] == "serve"
    assert t["phase_order"] == ["stance", "toss", "trophy", "cocking", "contact", "follow_through"]


def test_analyze_routes_to_tennis(tennis_client):
    r = tennis_client.post(
        "/analyze",
        files={"video": ("serve.mp4", io.BytesIO(b"x"), "video/mp4")},
        data={"sport": "tennis"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sport"] == "tennis"
    assert body["motion"] == "serve"
    assert body["phase_order"] == ["stance", "toss", "trophy", "cocking", "contact", "follow_through"]
    assert set(body["phases"]) == {"stance", "toss", "trophy", "cocking", "contact", "follow_through"}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_registry.py tests/test_api.py -v`
Expected: the new tests FAIL (`UnknownSport: unknown sport 'tennis'`; `list_sports` returns only basketball).

- [ ] **Step 3: Implement `TennisPlugin`**

Replace `backend/analyzer/sports/tennis/__init__.py` with:

```python
"""Tennis serve analysis plugin."""
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

- [ ] **Step 4: Register in `registry.py`**

In `backend/analyzer/registry.py`:

```python
from analyzer.sports.basketball import BasketballPlugin
from analyzer.sports.tennis import TennisPlugin
```

and

```python
SPORTS: dict[str, SportPlugin] = {
    p.name: p for p in (BasketballPlugin(), TennisPlugin())
}
```

- [ ] **Step 5: Add tennis modules to the core-purity list**

In `backend/tests/test_core_purity.py`, extend `CORE`:

```python
    "sports/tennis/__init__.py",
    "sports/tennis/metrics.py",
    "sports/tennis/phases.py",
    "sports/tennis/scoring.py",
```

(`sports/tennis/rendering.py` stays out — image module, like `sports/basketball/rendering.py` and, after Task 5, `skeleton.py`.)

- [ ] **Step 6: Run the whole backend suite + ruff**

Run: `cd backend && ruff check . && python -m pytest -m "not mediapipe" -q`
Expected: all PASS, ruff clean. In particular `tests/test_plugin_contract.py` now runs its three parametrised checks against `tennis` with no edit (it iterates `registry.SPORTS`), and `tests/test_core_purity.py` passes with the four new entries.

- [ ] **Step 7: Commit**

```bash
git add backend/analyzer/sports/tennis/__init__.py backend/analyzer/registry.py backend/tests/test_core_purity.py backend/tests/test_registry.py backend/tests/test_api.py
git commit -m "feat(tennis): register TennisPlugin in the sport registry" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_017KLgfxPWWY4vEMR2tfxMFy"
```

---

## Final verification (run after Task 6)

```bash
cd backend && ruff check . && python -m pytest -m "not mediapipe" -q
```

- Full suite green, ruff clean.
- `git diff --stat main...tennis-serve-plugin` touches only: `docs/`, `backend/analyzer/sports/tennis/*` (new), `backend/analyzer/registry.py`, `backend/analyzer/skeleton.py`, `backend/analyzer/sports/basketball/rendering.py` (drawing lift only), `backend/tests/*`. No change to `backend/analyzer/pipeline.py`, `camera.py`, `geometry.py`, `scoring_curve.py`, `sports/base.py`, `sports/basketball/{metrics,phases,scoring}.py`, `backend/api.py`, `backend/main.py`, `tests/golden/*`.
- `tests/test_no_regression.py` and `tests/test_pipeline_golden.py` pass untouched (basketball unaffected).

## Optional follow-up (not in this plan)

Capture `tests/golden/tennis_synth.json` from `synth.make_serve()` plus a `test_tennis_golden.py` freezing the analysis fields (not the base64 media). Nice-to-have regression insurance; skip unless asked.

## Self-Review

**Spec coverage:**
- 6-phase model, `PHASE_ORDER` — Task 3. ✓
- Dominant-wrist racket proxy, handedness once per clip — Task 1 (`frame_metrics`). ✓
- All 14 metric keys incl. the 3 new geometry expressions — Task 1. ✓
- Shared camera classifier reused, forwarded by `segment` — Task 3. ✓
- Literature-derived `IDEALS` with docstring citations, `PHASE_INFO`, `PHASE_RESOURCES` (2/phase, concrete URLs), per-phase `generate_feedback`, `score` with unavailable handling and unit-suffix rule — Task 4. ✓
- Side-profile `draw_ideal_skeleton` per phase in app palette with Target/You badge + cue; `render_all` reusing shared gif/frame helpers — Task 5. ✓
- `synth.make_serve()` deterministic 6-phase sweep; all tennis tests video-free — Task 2. ✓
- `TennisPlugin` + registry; `GET /sports` two entries; `/analyze sport=tennis` routes — Task 6. ✓
- `test_core_purity` CORE widened; `test_plugin_contract` auto-covers tennis — Task 6. ✓
- Basketball goldens untouched — asserted in Final verification. ✓
- Spec deviation (`shoulder_hip_separation` concrete def) — recorded up top. ✓

**Placeholder scan:** No TBD/TODO. Every code step has full source. Tasks 3/4 include explicit tuning-fallback instructions (adjust synth keyframes, regenerate, re-run, ledger the change) rather than vague "handle edge cases" — these are concrete recovery procedures for a synthetic-fixture calibration, not placeholders.

**Type consistency:** `frame_metrics(frames: list) -> list` and `_frame_metrics(frame, side)` consistent across Tasks 1/3/4/6. `segment(...) -> {"phases", "camera_view", "confidence"}` matches basketball and `pipeline.run`. `score(phase_metrics) -> {"overall_score", "priority", "phases"}` matches basketball. `render_all(frames, metrics, phases, phase_metrics)` signature matches basketball's and `SportPlugin.render`'s call in `pipeline.run`. `draw_ideal_skeleton(phase, metrics, size)` consistent Task 5 ↔ tests. `PHASE_ORDER` list identical everywhere it appears.

**Known risk carried into execution:** the synthetic serve's metrics must land inside the ideal bands for `test_good_serve_scores_reasonably` and inside the segmentation windows for the ordering tests. Tasks 2–4 give the implementer explicit permission and a procedure to iterate the `_SRV_*` keyframe tables (preferred) or, as a last resort with a ledgered rationale, nudge a band. This is expected calibration, not a design gap.
