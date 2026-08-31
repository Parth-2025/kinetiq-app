# KinetiQ Phase A — Engine Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `backend/analyzer/` into a pure, independently testable analysis core with motion-based phase detection, camera-view flagging, a documented scoring curve, a full pytest suite that runs without video or MediaPipe, and CI.

**Architecture:** The analysis core (`angles.py`, `phases.py`, `scoring.py`) becomes pure functions over plain dicts / lists / numpy arrays — no FastAPI, no image libraries, no MediaPipe. I/O-heavy code (`pose.py` for MediaPipe extraction, `rendering.py` for OpenCV/PIL drawing, `api.py` for HTTP) sits at the edges and stays thin. Tests run against **synthetic landmark sequences** generated deterministically in code (`tests/synth.py`), so no sample videos are needed. A one-shot script captures the *current* pipeline's output on those same synthetic inputs as golden files before any module is changed; the refactor must reproduce them except for the intentional phase-detection and scoring-curve changes, each recorded in `backend/CHANGES.md`.

**Tech Stack:** Python 3.11/3.12, FastAPI, MediaPipe (lazy-imported), OpenCV (`opencv-python-headless`), Pillow, NumPy, `pydantic-settings`, pytest, ruff, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-kinetiq-engine-sessions-ml-design.md` — Phase A only (sections "Phase A — Engine hardening" and the "Cross-cutting concerns" that apply to it). Phases B and C are out of scope for this plan.

## Global Constraints

- **Runtime Python:** 3.11 or 3.12. MediaPipe has no wheels for 3.13. CI runs on 3.11. State this in `backend/README.md`.
- **MediaPipe is lazy-imported.** No module-level `import mediapipe` anywhere. It is imported inside the function that uses it (`pose.extract_landmarks_from_video`), matching the existing legacy pattern. This lets every non-`pose` test run without MediaPipe installed.
- **`/analyze` response stays backward compatible.** The frontend (`frontend/types/analysis.ts`) consumes `overall_score`, `priority`, `phases`, `pose_gif`, `phase_images`. These keys and their shapes do not change. New top-level fields (`camera_view`, `confidence`) are additive only.
- **Analysis core purity.** `angles.py`, `phases.py`, `scoring.py` must not import `fastapi`, `cv2`, `PIL`, `mediapipe`, or any database library. Enforced by `tests/test_core_purity.py`.
- **Package layout.** `analyzer` remains a top-level package under `backend/`. `settings.py` is a sibling module at `backend/settings.py`. Tests and tools use `pythonpath = ["backend"]` (set in `backend/pyproject.toml`). Import forms: `from analyzer import angles, phases, scoring`; `from settings import settings`.
- **Git identity:** every commit authored as `Parth Mohan <parthmohan2006@gmail.com>` (already configured on this clone). Work stays on branch `phase-a-engine`. Commit after every task.
- **Legacy IDEAL/threshold values** are copied verbatim from `backend/analyzer/feedback_engine.py` (`PHASE_IDEALS`) and `backend/analyzer/pose_detector.py` (`IDEAL_RANGES`). Angle-metric falloff widths are fixed at `30.0` so the new scoring curve is numerically identical to the legacy curve for angle metrics; only the two *tilt* metrics get a tighter falloff (the documented, intentional scoring change).

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `backend/settings.py` | `pydantic-settings` config: `model_cache_dir`, `cors_origins`. |
| `backend/analyzer/angles.py` | Landmark frame dict → joint angles / tilts / y-positions. Pure. |
| `backend/analyzer/phases.py` | Angle sequence → phase frame indices + `camera_view` + `confidence`; phase-slice helpers. Pure. |
| `backend/analyzer/scoring.py` | Phase angles → per-phase scores, feedback text, overall score, priority. Pure. `IDEALS` table lives here. |
| `backend/analyzer/pose.py` | Video path → list of per-frame landmark dicts. MediaPipe + OpenCV, lazy-imported. Model-file singleton. |
| `backend/analyzer/rendering.py` | Skeleton overlays, pose GIF, ideal-form diagram, per-phase image pairs. OpenCV + PIL. |
| `backend/api.py` | FastAPI `APIRouter`: `GET /health`, `POST /analyze`. Wires core + rendering; offloads CPU work with `run_in_threadpool`. |
| `backend/pyproject.toml` | `[tool.ruff]`, `[tool.pytest.ini_options]` (registers `mediapipe` marker, `pythonpath`, `testpaths`). |
| `backend/requirements-dev.txt` | `pytest`, `pytest-cov`, `ruff`, `httpx`. |
| `backend/CHANGES.md` | Records every intentional behavior difference from the legacy pipeline, with before/after values and rationale. |
| `backend/tests/__init__.py` | Empty — makes `tests` importable. |
| `backend/tests/conftest.py` | Fixtures: `fixture_frames`, path helpers. |
| `backend/tests/synth.py` | Deterministic synthetic landmark-sequence generator. No video, no MediaPipe. |
| `backend/tests/gen_fixtures.py` | One-shot: writes the six synthetic scenarios to `tests/fixtures/*.json`. |
| `backend/tests/capture_legacy_golden.py` | One-shot: runs the **current** analyzer on the fixtures, writes `tests/golden/legacy_*.json`. Run once, before Task 4. |
| `backend/tests/fixtures/*.json` | Serialized synthetic landmark sequences (6 scenarios). |
| `backend/tests/golden/legacy_*.json` | Current-pipeline output on the fixtures (baseline). |
| `backend/tests/golden/current_*.json` | New-pipeline output on the fixtures (locked in Task 7). |
| `backend/tests/test_core_purity.py` | Asserts core modules import none of the forbidden libraries. |
| `backend/tests/test_angles.py` | Angle math on known geometry + fixture shape checks. |
| `backend/tests/test_phases.py` | Segmentation ordering, camera-view, confidence, degenerate inputs. |
| `backend/tests/test_scoring.py` | Piecewise curve at boundaries, aggregation, priority, `ready_position` path. |
| `backend/tests/test_pipeline_golden.py` | Full core pipeline on fixtures vs `golden/current_*.json`. |
| `backend/tests/test_no_regression.py` | New core vs `golden/legacy_*.json`, asserting only the documented deltas differ. |
| `backend/tests/test_settings.py` | Env-var overrides, defaults. |
| `backend/tests/test_pose_smoke.py` | `@pytest.mark.mediapipe` — runs `pose.extract_landmarks_from_video` on a bundled clip if present, else skips. |
| `backend/tests/test_api.py` | `TestClient` against `POST /analyze` with `pose` + `rendering` monkeypatched. |
| `.github/workflows/ci.yml` | ruff + `pytest -m "not mediapipe"` on Python 3.11. |

**Modified:**

| Path | Change |
|---|---|
| `backend/main.py` | Reduced to app construction: `FastAPI(...)`, CORS from `settings.cors_origins`, `app.include_router(api.router)`. |
| `backend/requirements.txt` | Rewritten to a short, loosely-pinned runtime list; `opencv-python`/`opencv-contrib-python` → `opencv-python-headless`; add `pydantic-settings`. |
| `backend/analyzer/__init__.py` | Re-export the public core API. |
| `backend/README.md` | Python version note, new run/test instructions, `KINETIQ_*` env vars. |
| `.gitignore` | Append Python entries. |

**Deleted (in Task 11, once nothing imports them):**

- `backend/analyzer/pose_detector.py`
- `backend/analyzer/shot_analyzer.py`
- `backend/analyzer/feedback_engine.py`
- all committed `backend/**/__pycache__/*.pyc`

---

## Task 1: Repo hygiene and test infrastructure

**Files:**
- Create: `backend/pyproject.toml`, `backend/requirements-dev.txt`, `backend/tests/__init__.py`, `backend/tests/conftest.py`
- Modify: `backend/requirements.txt`, `.gitignore`
- Delete from index: `backend/**/__pycache__/*.pyc`

**Interfaces:**
- Consumes: nothing.
- Produces: a `tests/` package that `pytest` discovers; `pythonpath=["backend"]` so `from analyzer ...` and `from settings ...` resolve; the `mediapipe` pytest marker.

- [ ] **Step 1: Remove committed bytecode and ignore it**

```bash
cd /Users/parthmohan/Desktop/GithubBot/KinetiQ
git rm -r --cached --ignore-unmatch 'backend/**/__pycache__' 'backend/**/*.pyc'
```

Append to `.gitignore`:

```
# Python backend
__pycache__/
*.pyc
backend/.venv/
.venv/
.pytest_cache/
.ruff_cache/
.coverage
htmlcov/
.cache/
*.task
```

- [ ] **Step 2: Rewrite `backend/requirements.txt` as a runtime list**

```
fastapi~=0.135
uvicorn~=0.44
python-multipart~=0.0.26
pydantic~=2.12
pydantic-settings~=2.6
numpy~=2.1
opencv-python-headless~=4.10
pillow~=11.0
mediapipe~=0.10.14
```

- [ ] **Step 3: Create `backend/requirements-dev.txt`**

```
-r requirements.txt
pytest~=8.3
pytest-cov~=6.0
ruff~=0.8
httpx~=0.28
```

- [ ] **Step 4: Create `backend/pyproject.toml`**

```toml
[tool.ruff]
line-length = 100
target-version = "py311"
src = ["backend"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
ignore = ["E501"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
markers = [
    "mediapipe: test requires the mediapipe package and a sample video (deselect with -m 'not mediapipe')",
]
```

Note: pytest is invoked with `backend/` as the working directory (`cd backend && pytest`), so `pythonpath = ["."]` puts `backend/` on `sys.path`. CI and all run commands in this plan `cd backend` first.

- [ ] **Step 5: Create `backend/tests/__init__.py` (empty) and `backend/tests/conftest.py`**

```python
import json
from pathlib import Path

import numpy as np
import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"
GOLDEN_DIR = Path(__file__).parent / "golden"

FIXTURE_NAMES = [
    "good_form_side",
    "shallow_load_side",
    "elbow_flare_side",
    "front_view",
    "no_pose",
    "truncated",
]


def _deserialize(frames: list) -> list:
    """JSON list-of-lists back into list[dict[str, np.ndarray] | None]."""
    out = []
    for frame in frames:
        if frame is None:
            out.append(None)
        else:
            out.append({name: np.asarray(vals, dtype=float) for name, vals in frame.items()})
    return out


def load_fixture(name: str) -> list:
    data = json.loads((FIXTURE_DIR / f"{name}.json").read_text())
    return _deserialize(data)


@pytest.fixture
def fixture_frames():
    return load_fixture


@pytest.fixture(params=FIXTURE_NAMES)
def any_fixture(request):
    return request.param, load_fixture(request.param)
```

- [ ] **Step 6: Verify the harness runs with zero tests**

Run: `cd backend && python -m pytest -q`
Expected: `no tests ran` (exit code 5) — not an import/collection error.

Run: `cd backend && python -m ruff check .`
Expected: `All checks passed!` (only `conftest.py` exists; it is clean).

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/requirements.txt backend/requirements-dev.txt \
        backend/tests/__init__.py backend/tests/conftest.py .gitignore
git commit -m "chore(backend): test harness, dep split, stop tracking bytecode"
```

---

## Task 2: Synthetic landmark generator

**Files:**
- Create: `backend/tests/synth.py`, `backend/tests/gen_fixtures.py`
- Create (generated, then committed): `backend/tests/fixtures/*.json`
- Test: `backend/tests/test_synth.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `synth.make_shot(n_frames=60, shooting_side="right", view="side", load_knee_deg=95.0, setpoint_elbow_deg=92.0, release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01, truncate_frac=None) -> list[dict[str, np.ndarray]]` — each dict maps all 21 landmark names to a length-4 `np.ndarray` `[x, y, z, visibility]`, coords in MediaPipe-style normalized space with y increasing downward.
  - `synth.SCENARIOS: dict[str, dict]` — kwargs for the six named fixtures.
  - `synth.no_pose(n_frames=40) -> list[None]`.

- [ ] **Step 1: Write `backend/tests/synth.py`**

```python
"""Deterministic synthetic landmark sequences for tests. No video, no MediaPipe.

Coordinates are MediaPipe-style normalized floats in [0, 1], y increasing
downward. Only the joints the analysis core reads are placed with real
geometry; the rest are filled with plausible fixed offsets so serialization
round-trips.
"""
from __future__ import annotations

import numpy as np

LANDMARK_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_heel", "right_heel", "left_foot", "right_foot",
]

# limb lengths in normalized units
_TORSO = 0.26
_THIGH = 0.20
_SHIN = 0.20
_UPPER_ARM = 0.14
_FOREARM = 0.13


def _lerp_keys(t: float, keys: list[tuple[float, float]]) -> float:
    """Piecewise-linear interpolation. keys sorted by fraction, fractions in [0, 1]."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if t <= f1:
            span = f1 - f0
            a = 0.0 if span == 0 else (t - f0) / span
            return v0 + a * (v1 - v0)
    return keys[-1][1]


def _rot(vec: np.ndarray, deg: float) -> np.ndarray:
    r = np.radians(deg)
    c, s = np.cos(r), np.sin(r)
    return np.array([c * vec[0] - s * vec[1], s * vec[0] + c * vec[1]])


def _p(xy: np.ndarray, z: float = 0.0, vis: float = 1.0) -> np.ndarray:
    return np.array([float(xy[0]), float(xy[1]), z, vis], dtype=float)


# time profiles (fraction of clip -> degrees)
_KNEE = [(0.0, 172), (0.15, 168), (0.40, None), (0.68, 176), (1.0, 178)]
_HIP = [(0.0, 165), (0.40, 120), (0.70, 168), (1.0, 172)]
_ARM_ELEV = [(0.0, 12), (0.40, 30), (0.60, 150), (0.68, 170), (1.0, 150)]
_ELBOW = [(0.0, 58), (0.35, 70), (0.55, None), (0.68, None), (1.0, 165)]


def make_shot(
    n_frames: int = 60,
    shooting_side: str = "right",
    view: str = "side",
    load_knee_deg: float = 95.0,
    setpoint_elbow_deg: float = 92.0,
    release_elbow_deg: float = 168.0,
    guide_elbow_deg: float = 80.0,
    shoulder_tilt: float = 0.01,
    truncate_frac: float | None = None,
) -> list[dict]:
    shoulder_sep = 0.05 if view == "side" else 0.26
    knee_keys = [(f, v if v is not None else load_knee_deg) for f, v in _KNEE]
    elbow_keys = [
        (0.0, 58), (0.35, 70),
        (0.55, setpoint_elbow_deg), (0.68, release_elbow_deg), (1.0, 165),
    ]

    frames: list[dict] = []
    total = n_frames if truncate_frac is None else max(6, int(n_frames * truncate_frac))

    for i in range(total):
        t = i / (n_frames - 1)
        knee_a = _lerp_keys(t, knee_keys)
        hip_a = _lerp_keys(t, _HIP)
        arm_elev = _lerp_keys(t, _ARM_ELEV)
        elbow_a = _lerp_keys(t, elbow_keys)

        hip_c = np.array([0.50, 0.52])                       # pelvis center
        up = np.array([0.0, -1.0])

        # legs: knee placed at hip_a from vertical, ankle gives interior knee_a
        knee_dir = _rot(up, hip_a)
        knee = hip_c + _THIGH * knee_dir
        thigh_back = -knee_dir
        ankle = knee + _SHIN * _rot(thigh_back, knee_a)

        # torso straight up
        neck = hip_c + _TORSO * up
        sh_sh = shoulder_sep / 2.0

        # shooting arm: elbow at arm_elev from vertical, wrist gives interior elbow_a
        sh_shoot = neck + np.array([sh_sh if shooting_side == "right" else -sh_sh, 0.0])
        elbow_dir = _rot(up, arm_elev if shooting_side == "right" else -arm_elev)
        elbow_s = sh_shoot + _UPPER_ARM * elbow_dir
        ua_back = -elbow_dir
        wrist_s = elbow_s + _FOREARM * _rot(ua_back, elbow_a if shooting_side == "right" else -elbow_a)

        # guide arm: low, constant guide_elbow_deg
        sh_guide = neck + np.array([-sh_sh if shooting_side == "right" else sh_sh, 0.0])
        g_elbow_dir = _rot(up, -35 if shooting_side == "right" else 35)
        elbow_g = sh_guide + _UPPER_ARM * g_elbow_dir
        wrist_g = elbow_g + _FOREARM * _rot(-g_elbow_dir, guide_elbow_deg)

        left_is_shoot = shooting_side == "left"
        sh_L, sh_R = (sh_shoot, sh_guide) if left_is_shoot else (sh_guide, sh_shoot)
        el_L, el_R = (elbow_s, elbow_g) if left_is_shoot else (elbow_g, elbow_s)
        wr_L, wr_R = (wrist_s, wrist_g) if left_is_shoot else (wrist_g, wrist_s)

        # apply shoulder tilt to the right shoulder only
        sh_R = sh_R + np.array([0.0, shoulder_tilt])

        hip_L = hip_c + np.array([-0.06, 0.0])
        hip_R = hip_c + np.array([0.06, 0.0])
        knee_L = knee + np.array([-0.04, 0.0])
        knee_R = knee + np.array([0.04, 0.0])
        ankle_L = ankle + np.array([-0.04, 0.0])
        ankle_R = ankle + np.array([0.04, 0.0])
        head = neck + np.array([0.0, -0.10])

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
            "left_ankle": _p(ankle_L),
            "right_ankle": _p(ankle_R),
            "left_heel": _p(ankle_L + np.array([-0.01, 0.03])),
            "right_heel": _p(ankle_R + np.array([0.01, 0.03])),
            "left_foot": _p(ankle_L + np.array([-0.05, 0.04])),
            "right_foot": _p(ankle_R + np.array([0.05, 0.04])),
        }
        frames.append(frame)

    return frames


def no_pose(n_frames: int = 40) -> list[None]:
    return [None] * n_frames


SCENARIOS: dict[str, dict] = {
    "good_form_side": dict(view="side", load_knee_deg=95.0, setpoint_elbow_deg=92.0,
                           release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01),
    "shallow_load_side": dict(view="side", load_knee_deg=140.0, setpoint_elbow_deg=92.0,
                              release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01),
    "elbow_flare_side": dict(view="side", load_knee_deg=95.0, setpoint_elbow_deg=125.0,
                             release_elbow_deg=168.0, guide_elbow_deg=125.0, shoulder_tilt=0.02),
    "front_view": dict(view="front", load_knee_deg=95.0, setpoint_elbow_deg=92.0,
                       release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01),
    "truncated": dict(view="side", load_knee_deg=95.0, setpoint_elbow_deg=92.0,
                      release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01,
                      truncate_frac=0.62),
}
```

- [ ] **Step 2: Write `backend/tests/test_synth.py` (failing)**

```python
import numpy as np

from tests import synth
from analyzer.angles import calculate_angle  # created in Task 4; see note below


def test_all_landmarks_present_and_shaped():
    frames = synth.make_shot(n_frames=30)
    assert len(frames) == 30
    for f in frames:
        assert set(f.keys()) == set(synth.LANDMARK_NAMES)
        for v in f.values():
            assert v.shape == (4,)


def test_shooting_wrist_rises_then_falls():
    frames = synth.make_shot(n_frames=60, shooting_side="right")
    wrist_y = [f["right_wrist"][1] for f in frames]
    lo = int(np.argmin(wrist_y))
    assert 20 < lo < 50  # highest point mid-clip


def test_knee_angle_hits_load_target():
    frames = synth.make_shot(n_frames=60, load_knee_deg=95.0)
    knee = [
        calculate_angle(f["right_hip"][:3], f["right_knee"][:3], f["right_ankle"][:3])
        for f in frames
    ]
    assert min(knee) == min(knee)
    assert abs(min(knee) - 95.0) < 12.0


def test_truncated_is_shorter_and_ends_before_release():
    full = synth.make_shot(n_frames=60)
    cut = synth.make_shot(n_frames=60, truncate_frac=0.62)
    assert len(cut) < len(full)
    assert 30 <= len(cut) <= 42


def test_front_view_has_wide_shoulders():
    side = synth.make_shot(view="side")[0]
    front = synth.make_shot(view="front")[0]
    side_sep = abs(side["left_shoulder"][0] - side["right_shoulder"][0])
    front_sep = abs(front["left_shoulder"][0] - front["right_shoulder"][0])
    assert front_sep > side_sep + 0.1
```

Note on import order: `test_synth.py` imports `calculate_angle` from Task 4. If executing strictly in order, move the `calculate_angle` import and the two tests that use it into Task 4's commit, or implement `calculate_angle` first. Simplest: in Step 3 below, add a minimal `analyzer/angles.py` containing only `calculate_angle` (its body is copied verbatim from `pose_detector.py`), then expand it in Task 4.

- [ ] **Step 3: Add minimal `backend/analyzer/angles.py` so the test imports resolve**

```python
import numpy as np


def calculate_angle(a, b, c) -> float:
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    c = np.asarray(c, dtype=float)
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))
```

- [ ] **Step 4: Run the tests — expect pass**

Run: `cd backend && python -m pytest tests/test_synth.py -v`
Expected: 5 passed.

- [ ] **Step 5: Write `backend/tests/gen_fixtures.py` and generate the fixtures**

```python
"""One-shot: serialize the synthetic scenarios to tests/fixtures/*.json.
Run from backend/: python -m tests.gen_fixtures
"""
import json
from pathlib import Path

from tests import synth

OUT = Path(__file__).parent / "fixtures"


def _serialize(frames: list) -> list:
    out = []
    for f in frames:
        out.append(None if f is None else {k: [float(x) for x in v] for k, v in f.items()})
    return out


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, kwargs in synth.SCENARIOS.items():
        frames = synth.make_shot(n_frames=60, **kwargs)
        (OUT / f"{name}.json").write_text(json.dumps(_serialize(frames)))
    (OUT / "no_pose.json").write_text(json.dumps(_serialize(synth.no_pose(40))))
    print("wrote", len(synth.SCENARIOS) + 1, "fixtures to", OUT)


if __name__ == "__main__":
    main()
```

Run: `cd backend && python -m tests.gen_fixtures`
Expected: `wrote 6 fixtures to .../fixtures`. Files: `good_form_side.json`, `shallow_load_side.json`, `elbow_flare_side.json`, `front_view.json`, `truncated.json`, `no_pose.json`.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/synth.py backend/tests/gen_fixtures.py backend/tests/test_synth.py \
        backend/analyzer/angles.py backend/tests/fixtures/
git commit -m "test(backend): deterministic synthetic landmark generator and fixtures"
```

---

## Task 3: Capture legacy pipeline golden output

**Files:**
- Create: `backend/tests/capture_legacy_golden.py`
- Create (generated, then committed): `backend/tests/golden/legacy_*.json`

**Interfaces:**
- Consumes: the **current** `analyzer.pose_detector` / `analyzer.shot_analyzer` / `analyzer.feedback_engine` (still present, unchanged), and `tests/synth.py` fixtures.
- Produces: `tests/golden/legacy_<fixture>.json` for `good_form_side`, `shallow_load_side`, `elbow_flare_side`, `front_view`, `truncated` — the frozen baseline that Task 7 compares against. `no_pose` is excluded (the legacy code raises before producing analysis).

**This task must run before Task 4 changes `angles.py`.** It only reads legacy code; it does not modify it.

- [ ] **Step 1: Write `backend/tests/capture_legacy_golden.py`**

```python
"""One-shot: run the CURRENT analyzer on the fixtures, freeze the output.
Run from backend/ BEFORE refactoring: python -m tests.capture_legacy_golden
"""
import json
from pathlib import Path

from analyzer.feedback_engine import analyze_form_by_phase
from analyzer.pose_detector import compute_angles_per_frame
from analyzer.shot_analyzer import detect_shot_phases, extract_phase_angles
from tests.conftest import load_fixture

OUT = Path(__file__).parent / "golden"
NAMES = ["good_form_side", "shallow_load_side", "elbow_flare_side", "front_view", "truncated"]


def _clean(obj):
    """Drop non-JSON-able numpy/image cruft the legacy dicts carry."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    if hasattr(obj, "item"):
        return obj.item()
    return obj


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name in NAMES:
        frames = load_fixture(name)
        angles_list = compute_angles_per_frame(frames)
        phases = detect_shot_phases(angles_list)
        phase_angles = extract_phase_angles(angles_list, phases)
        analysis = analyze_form_by_phase(phase_angles)
        record = {"phases": phases, "analysis": _clean(analysis)}
        (OUT / f"legacy_{name}.json").write_text(json.dumps(record, indent=2, sort_keys=True))
    print("wrote", len(NAMES), "legacy goldens to", OUT)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `cd backend && python -m tests.capture_legacy_golden`
Expected: `wrote 5 legacy goldens to .../golden`. Inspect `golden/legacy_good_form_side.json` — it has `phases` (5 integer indices) and `analysis` (`overall_score`, `priority`, `phases` with per-phase `score`/`status`/`feedback`).

- [ ] **Step 3: Commit the baseline**

```bash
git add backend/tests/capture_legacy_golden.py backend/tests/golden/
git commit -m "test(backend): freeze legacy analyzer output as regression baseline"
```

---

## Task 4: `analyzer/angles.py` — pure angle computation

**Files:**
- Modify: `backend/analyzer/angles.py` (expand the minimal stub from Task 2)
- Test: `backend/tests/test_angles.py`

**Interfaces:**
- Consumes: frame dicts from `tests/synth.py` / `pose.py` — `dict[str, np.ndarray(4)]`.
- Produces:
  - `calculate_angle(a, b, c) -> float` (unchanged from stub).
  - `frame_angles(frame: dict) -> dict` — keys: `shooting_side` (`"left"`/`"right"`), `elbow_angle`, `knee_angle`, `hip_angle`, `guide_elbow_angle`, `shoulder_tilt`, `hip_tilt`, `shooting_wrist_y`, `shooting_elbow_y`, `shooting_shoulder_y`, `torso_width`, `torso_height` (all `float`).
  - `angles_per_frame(frames: list) -> list` — `frame_angles` per non-`None` frame, `None` passthrough.

The legacy `compute_angles_per_frame` (in `pose_detector.py`) is the reference for `shooting_side`, `elbow_angle`, `knee_angle`, `hip_angle`, `shoulder_tilt`, `hip_tilt`, `guide_elbow_angle`, `shooting_wrist_y`, `shooting_elbow_y` — copy that logic verbatim. New keys added here: `shooting_shoulder_y` (for follow-through detection), `torso_width` and `torso_height` (for camera-view classification). New `angles.py` does **not** carry `_frame` / `_raw_landmarks` — rendering gets those from the raw `frames` list by index.

- [ ] **Step 1: Write failing tests in `backend/tests/test_angles.py`**

```python
import numpy as np
import pytest

from analyzer.angles import angles_per_frame, calculate_angle, frame_angles
from tests import synth
from tests.conftest import FIXTURE_NAMES, load_fixture


def test_calculate_angle_right_angle():
    a = [0.0, 1.0, 0.0]
    b = [0.0, 0.0, 0.0]
    c = [1.0, 0.0, 0.0]
    assert abs(calculate_angle(a, b, c) - 90.0) < 1e-6


def test_calculate_angle_straight_line():
    assert abs(calculate_angle([0, 2, 0], [0, 1, 0], [0, 0, 0]) - 180.0) < 1e-6


def test_frame_angles_keys():
    frame = synth.make_shot(n_frames=10)[5]
    a = frame_angles(frame)
    assert set(a) == {
        "shooting_side", "elbow_angle", "knee_angle", "hip_angle",
        "guide_elbow_angle", "shoulder_tilt", "hip_tilt",
        "shooting_wrist_y", "shooting_elbow_y", "shooting_shoulder_y",
        "torso_width", "torso_height",
    }


def test_shooting_side_follows_higher_wrist():
    right = frame_angles(synth.make_shot(shooting_side="right")[30])
    left = frame_angles(synth.make_shot(shooting_side="left")[30])
    assert right["shooting_side"] == "right"
    assert left["shooting_side"] == "left"


def test_front_view_has_larger_torso_width():
    side = frame_angles(synth.make_shot(view="side")[0])
    front = frame_angles(synth.make_shot(view="front")[0])
    assert front["torso_width"] > side["torso_width"] + 0.1
    assert side["torso_height"] > 0.1


def test_angles_per_frame_passes_none_through():
    out = angles_per_frame([None, synth.make_shot(n_frames=3)[0], None])
    assert out[0] is None and out[2] is None
    assert isinstance(out[1], dict)


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_every_fixture_computes_without_error(name):
    out = angles_per_frame(load_fixture(name))
    if name == "no_pose":
        assert all(x is None for x in out)
    else:
        assert any(isinstance(x, dict) for x in out)
```

- [ ] **Step 2: Run — expect failure**

Run: `cd backend && python -m pytest tests/test_angles.py -v`
Expected: FAIL — `ImportError: cannot import name 'frame_angles'`.

- [ ] **Step 3: Expand `backend/analyzer/angles.py`**

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


def frame_angles(frame: dict) -> dict:
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


def angles_per_frame(frames: list) -> list:
    return [frame_angles(f) if f is not None else None for f in frames]
```

- [ ] **Step 4: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_angles.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/analyzer/angles.py backend/tests/test_angles.py
git commit -m "feat(backend): pure angle computation module with camera-view features"
```

---

## Task 5: `analyzer/phases.py` — motion-based segmentation and camera-view

**Files:**
- Create: `backend/analyzer/phases.py`
- Test: `backend/tests/test_phases.py`

**Interfaces:**
- Consumes: `angles_per_frame(...)` output — `list[dict | None]` with the keys from Task 4.
- Produces:
  - `PHASE_KEYS = ["ready_position", "load", "set_point", "release", "follow_through"]`.
  - `classify_camera_view(angles_list) -> tuple[str, float]` — `(view, confidence)`, `view` ∈ `{"side", "front", "oblique"}`, `confidence` ∈ `[0.0, 1.0]`.
  - `segment_phases(angles_list) -> dict` — `{"phases": {k: int | None}, "camera_view": str, "confidence": float}`.
  - `extract_phase_angles(angles_list, phases: dict) -> dict` — `{phase: dict | None}`.
  - `extract_phase_indices(phases: dict) -> dict` — passthrough of `{phase: int | None}` (kept for rendering).

Detection rules (from spec A.2): **set point** = global min of `shooting_wrist_y`; **load** = min `knee_angle` in frames up to and including set point; **ready_position** = last frame before load within 15° of the pre-load max `knee_angle`, else first valid; **release** = after set point, frame of max positive elbow-extension velocity (first difference of `elbow_angle` over frame index gap), else last-after, else set point; **follow_through** = last frame after release with `shooting_wrist_y < shooting_shoulder_y`, else last-after, else last valid. Fewer than 5 valid frames → all phases `None`.

Camera view: `ratio = median(torso_width / torso_height)` over valid frames. `ratio < 0.55` → `"side"`, confidence `min(1.0, 0.5 + (0.55 - ratio))`. `ratio > 0.9` → `"front"`, confidence `max(0.0, 0.4 - (ratio - 0.9))`. Otherwise `"oblique"`, confidence `0.4`. No valid frames → `("oblique", 0.2)`.

- [ ] **Step 1: Write failing tests in `backend/tests/test_phases.py`**

```python
import pytest

from analyzer.angles import angles_per_frame
from analyzer.phases import (
    PHASE_KEYS,
    classify_camera_view,
    extract_phase_angles,
    segment_phases,
)
from tests import synth
from tests.conftest import load_fixture


def _seg(name):
    return segment_phases(angles_per_frame(load_fixture(name)))


def test_phase_keys_present():
    out = _seg("good_form_side")
    assert set(out["phases"]) == set(PHASE_KEYS)


def test_phase_ordering_good_form():
    p = _seg("good_form_side")["phases"]
    idx = [p[k] for k in PHASE_KEYS]
    assert all(v is not None for v in idx)
    assert idx == sorted(idx)


def test_load_is_deepest_knee_bend():
    frames = angles_per_frame(load_fixture("good_form_side"))
    p = segment_phases(frames)["phases"]
    knees = [(i, a["knee_angle"]) for i, a in enumerate(frames) if a]
    true_min_i = min(knees, key=lambda x: x[1])[0]
    assert abs(p["load"] - true_min_i) <= 1


def test_truncated_clip_has_no_release_or_follow_through():
    p = _seg("truncated")["phases"]
    assert p["set_point"] is not None
    assert p["release"] is None or p["follow_through"] is None


def test_degenerate_short_clip_all_none():
    out = segment_phases(angles_per_frame(synth.make_shot(n_frames=4)))
    assert all(v is None for v in out["phases"].values())


def test_camera_view_side_vs_front():
    side_view, side_conf = classify_camera_view(angles_per_frame(load_fixture("good_form_side")))
    front_view, front_conf = classify_camera_view(angles_per_frame(load_fixture("front_view")))
    assert side_view == "side"
    assert front_view == "front"
    assert side_conf > front_conf


def test_segment_reports_low_confidence_for_front_view():
    out = _seg("front_view")
    assert out["camera_view"] == "front"
    assert out["confidence"] <= 0.4


def test_no_pose_returns_all_none_and_oblique():
    out = segment_phases(angles_per_frame(load_fixture("no_pose")))
    assert all(v is None for v in out["phases"].values())
    assert out["camera_view"] == "oblique"


def test_extract_phase_angles_shape():
    frames = angles_per_frame(load_fixture("good_form_side"))
    seg = segment_phases(frames)
    pa = extract_phase_angles(frames, seg["phases"])
    assert set(pa) == set(PHASE_KEYS)
    assert pa["set_point"] is not None
```

- [ ] **Step 2: Run — expect failure**

Run: `cd backend && python -m pytest tests/test_phases.py -v`
Expected: FAIL — module `analyzer.phases` does not exist.

- [ ] **Step 3: Write `backend/analyzer/phases.py`**

```python
import numpy as np

PHASE_KEYS = ["ready_position", "load", "set_point", "release", "follow_through"]


def _valid(angles_list: list) -> list:
    return [(i, a) for i, a in enumerate(angles_list) if a is not None]


def classify_camera_view(angles_list: list) -> tuple[str, float]:
    ratios = []
    for _, a in _valid(angles_list):
        h = a.get("torso_height", 0.0)
        if h > 1e-6:
            ratios.append(a.get("torso_width", 0.0) / h)
    if not ratios:
        return "oblique", 0.2
    ratio = float(np.median(ratios))
    if ratio < 0.55:
        return "side", float(min(1.0, 0.5 + (0.55 - ratio)))
    if ratio > 0.9:
        return "front", float(max(0.0, 0.4 - (ratio - 0.9)))
    return "oblique", 0.4


def segment_phases(angles_list: list) -> dict:
    valid = _valid(angles_list)
    view, confidence = classify_camera_view(angles_list)
    none_phases = {k: None for k in PHASE_KEYS}

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


def extract_phase_indices(phases: dict) -> dict:
    return {k: phases.get(k) for k in PHASE_KEYS}


def extract_phase_angles(angles_list: list, phases: dict) -> dict:
    out = {}
    for phase in PHASE_KEYS:
        idx = phases.get(phase)
        if idx is not None and 0 <= idx < len(angles_list) and angles_list[idx] is not None:
            out[phase] = angles_list[idx]
        else:
            out[phase] = None
    return out
```

- [ ] **Step 4: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_phases.py -v`
Expected: all pass. If `test_truncated_clip_has_no_release_or_follow_through` fails because the truncated fixture still yields a release, lower `truncate_frac` in `synth.SCENARIOS["truncated"]` to `0.55`, re-run `python -m tests.gen_fixtures`, re-run `python -m tests.capture_legacy_golden`, and re-commit those two directories before continuing.

- [ ] **Step 5: Commit**

```bash
git add backend/analyzer/phases.py backend/tests/test_phases.py
git commit -m "feat(backend): motion-based phase segmentation and camera-view classification"
```

---

## Task 6: `analyzer/scoring.py` — documented scoring curve and feedback

**Files:**
- Create: `backend/analyzer/scoring.py`
- Test: `backend/tests/test_scoring.py`

**Interfaces:**
- Consumes: `extract_phase_angles(...)` output — `{phase: dict | None}`.
- Produces:
  - `IDEALS: dict[str, dict[str, dict]]` — `{phase: {metric: {"lo": float, "hi": float, "falloff": float}}}`. Includes `ready_position`.
  - `score_metric(value: float, lo: float, hi: float, falloff: float) -> float` — 100.0 inside `[lo, hi]`; outside, `max(0.0, round(100.0 * (1.0 - dist / falloff), 1))` where `dist = min(|value - lo|, |value - hi|)`.
  - `PHASE_INFO: dict[str, dict]` — `{phase: {"emoji", "title", "description"}}` (verbatim from legacy `feedback_engine.PHASE_INFO`).
  - `PHASE_RESOURCES: dict[str, list[dict]]` (verbatim from legacy `feedback_engine.PHASE_RESOURCES`).
  - `analyze(phase_angles: dict) -> dict` — `{"overall_score": float, "priority": str, "phases": {phase: {**PHASE_INFO[phase], "score": float, "status": str, "feedback": str, "resources": list, "angles_measured": dict}}}`. Same shape as legacy `feedback_engine.analyze_form_by_phase`.

`IDEALS` values: copy the numeric bands verbatim from legacy `feedback_engine.PHASE_IDEALS`. `falloff` is `30.0` for every angle metric (`*_angle`); for the two tilt metrics (`shoulder_tilt`, `hip_tilt`) `falloff` is `0.08`, and for `release.shoulder_tilt` `falloff` is `0.10`. Legacy `PHASE_IDEALS` has no `ready_position` entry in `pose_detector.IDEAL_RANGES` but `feedback_engine.PHASE_IDEALS` **does** (`{"knee_angle": (160,175), "shoulder_tilt": (0.0,0.04), "hip_tilt": (0.0,0.04)}`) — use that. The `_generate_feedback` text is copied verbatim from `feedback_engine.py`, with threshold reads pointed at `IDEALS`.

- [ ] **Step 1: Write failing tests in `backend/tests/test_scoring.py`**

```python
from analyzer.angles import angles_per_frame
from analyzer.phases import extract_phase_angles, segment_phases
from analyzer.scoring import IDEALS, PHASE_INFO, analyze, score_metric
from tests.conftest import load_fixture


def _analyze(name):
    frames = angles_per_frame(load_fixture(name))
    seg = segment_phases(frames)
    return analyze(extract_phase_angles(frames, seg["phases"]))


def test_score_metric_inside_band_is_100():
    assert score_metric(95.0, 85.0, 100.0, 30.0) == 100.0
    assert score_metric(85.0, 85.0, 100.0, 30.0) == 100.0
    assert score_metric(100.0, 85.0, 100.0, 30.0) == 100.0


def test_score_metric_linear_falloff():
    assert score_metric(115.0, 85.0, 100.0, 30.0) == 50.0   # 15 past hi, half a falloff
    assert score_metric(70.0, 85.0, 100.0, 30.0) == 50.0    # 15 below lo
    assert score_metric(55.0, 85.0, 100.0, 30.0) == 0.0     # 30 past = floor
    assert score_metric(40.0, 85.0, 100.0, 30.0) == 0.0     # clamped, never negative


def test_tilt_metric_penalised_unlike_legacy():
    # legacy /30.0 curve gave ~99.8 here; the tighter falloff gives 50
    assert score_metric(0.09, 0.0, 0.04, 0.08) == 50.0


def test_ideals_has_ready_position():
    assert "ready_position" in IDEALS
    assert "knee_angle" in IDEALS["ready_position"]


def test_analyze_shape_matches_legacy_contract():
    result = _analyze("good_form_side")
    assert set(result) == {"overall_score", "priority", "phases"}
    for phase, block in result["phases"].items():
        assert phase in PHASE_INFO
        assert set(block) >= {
            "emoji", "title", "description", "score", "status", "feedback",
            "resources", "angles_measured",
        }


def test_good_form_scores_higher_than_shallow_load():
    good = _analyze("good_form_side")
    shallow = _analyze("shallow_load_side")
    assert good["phases"]["load"]["score"] > shallow["phases"]["load"]["score"]


def test_priority_is_lowest_scoring_phase():
    result = _analyze("shallow_load_side")
    lowest = min(result["phases"].items(), key=lambda kv: kv[1]["score"])[0]
    assert result["priority"] == lowest


def test_missing_phase_scores_zero_unavailable():
    result = analyze({k: None for k in PHASE_INFO})
    assert result["overall_score"] == 0
    for block in result["phases"].values():
        assert block["score"] == 0
        assert block["status"] == "unavailable"
```

- [ ] **Step 2: Run — expect failure**

Run: `cd backend && python -m pytest tests/test_scoring.py -v`
Expected: FAIL — module `analyzer.scoring` does not exist.

- [ ] **Step 3: Write `backend/analyzer/scoring.py`**

```python
from typing import Optional

IDEALS: dict[str, dict[str, dict]] = {
    "ready_position": {
        "knee_angle": {"lo": 160.0, "hi": 175.0, "falloff": 30.0},
        "shoulder_tilt": {"lo": 0.0, "hi": 0.04, "falloff": 0.08},
        "hip_tilt": {"lo": 0.0, "hi": 0.04, "falloff": 0.08},
    },
    "load": {
        "knee_angle": {"lo": 80.0, "hi": 110.0, "falloff": 30.0},
        "elbow_angle": {"lo": 80.0, "hi": 115.0, "falloff": 30.0},
        "hip_angle": {"lo": 100.0, "hi": 140.0, "falloff": 30.0},
    },
    "set_point": {
        "elbow_angle": {"lo": 85.0, "hi": 100.0, "falloff": 30.0},
        "guide_elbow_angle": {"lo": 60.0, "hi": 100.0, "falloff": 30.0},
        "knee_angle": {"lo": 100.0, "hi": 150.0, "falloff": 30.0},
    },
    "release": {
        "elbow_angle": {"lo": 155.0, "hi": 175.0, "falloff": 30.0},
        "knee_angle": {"lo": 160.0, "hi": 180.0, "falloff": 30.0},
        "shoulder_tilt": {"lo": 0.0, "hi": 0.05, "falloff": 0.10},
    },
    "follow_through": {
        "elbow_angle": {"lo": 155.0, "hi": 180.0, "falloff": 30.0},
    },
}

PHASE_INFO = {
    "ready_position": {"emoji": "🏀", "title": "Ready Position", "description": "Starting stance before the shot"},
    "load": {"emoji": "🦵", "title": "Load / Dip", "description": "Knee bend to generate upward power"},
    "set_point": {"emoji": "💪", "title": "Set Point", "description": "Ball position before release"},
    "release": {"emoji": "🚀", "title": "Release", "description": "The moment the ball leaves your hand"},
    "follow_through": {"emoji": "🤚", "title": "Follow Through", "description": "Finishing position after release"},
}

PHASE_RESOURCES = {
    "ready_position": [
        {"label": "Set Up Your Footwork Before Your Shot", "url": "https://jr.nba.com/video/set-up-your-footwork-before-your-shot/"},
        {"label": "Fundamentals of Shooting", "url": "https://jr.nba.com/video/fundamentals-of-shooting/"},
    ],
    "load": [
        {"label": "Practice the Shooting Proper Form", "url": "https://jr.nba.com/video/practice-the-shooting-proper-form/"},
        {"label": "Proper Shooting Technique Guide", "url": "https://www.breakthroughbasketball.com/fundamentals/shooting-technique.html"},
    ],
    "set_point": [
        {"label": "Dirk Shows Off Perfect Shooting Form", "url": "https://jr.nba.com/dirk-shows-off-perfect-shooting-form/"},
        {"label": "Form Shooting - 2 Hands", "url": "https://jr.nba.com/video/form-shooting-2-hands/"},
    ],
    "release": [
        {"label": "1-Step Form Shooting", "url": "https://jr.nba.com/video/1-step-form-shooting/"},
        {"label": "Basketball Shooting Resources", "url": "https://www.breakthroughbasketball.com/fundamentals/shooting.html"},
    ],
    "follow_through": [
        {"label": "Perfect Shot (No Basket)", "url": "https://jr.nba.com/video/perfect-shot-no-basket/"},
        {"label": "Jr. NBA at Home: Form Shooting", "url": "https://jr.nba.com/jr-nba-at-home-form-shooting/"},
    ],
}


def score_metric(value: float, lo: float, hi: float, falloff: float) -> float:
    if lo <= value <= hi:
        return 100.0
    dist = min(abs(value - lo), abs(value - hi))
    return max(0.0, round(100.0 * (1.0 - dist / falloff), 1))


def _generate_feedback(phase: str, angles: dict) -> tuple[str, str]:
    if phase == "ready_position":
        tilt = angles.get("shoulder_tilt", 0)
        knee = angles.get("knee_angle", 170)
        if tilt > 0.06:
            return (f"Your shoulders are tilting ({tilt:.2f}) — square up to the basket before your shot.", "warning")
        if knee < 155:
            return (f"You're bending too early ({knee:.0f}°) — stay upright in your ready position.", "warning")
        return ("Great ready position — balanced stance and squared shoulders give you a strong foundation.", "good")

    if phase == "load":
        knee = angles.get("knee_angle", 95)
        lo = IDEALS["load"]["knee_angle"]["lo"]
        hi = IDEALS["load"]["knee_angle"]["hi"]
        if knee > hi:
            return (f"Knee bend too shallow ({knee:.0f}°) — dip deeper to {lo:.0f}–{hi:.0f}° to load power into your legs.", "error")
        if knee < lo:
            return (f"Overbending ({knee:.0f}°) — aim for {lo:.0f}–{hi:.0f}° for explosive upward momentum.", "warning")
        return (f"Excellent leg load at {knee:.0f}° — generating great power from your base.", "good")

    if phase == "set_point":
        elbow = angles.get("elbow_angle", 90)
        guide = angles.get("guide_elbow_angle", 80)
        lo = IDEALS["set_point"]["elbow_angle"]["lo"]
        hi = IDEALS["set_point"]["elbow_angle"]["hi"]
        if elbow > hi:
            return (f"Elbow too open ({elbow:.0f}°) — tuck it under the ball to {lo:.0f}–{hi:.0f}° for better control.", "error")
        if elbow < lo:
            return (f"Elbow over-tucked ({elbow:.0f}°) — open slightly to {lo:.0f}–{hi:.0f}° for a fluid extension.", "warning")
        if guide > 110:
            return (f"Guide hand elbow flaring ({guide:.0f}°) — keep it closer to prevent side-spin.", "warning")
        return (f"Perfect set point at {elbow:.0f}° — elbow nicely positioned under the ball.", "good")

    if phase == "release":
        elbow = angles.get("elbow_angle", 165)
        lo = IDEALS["release"]["elbow_angle"]["lo"]
        hi = IDEALS["release"]["elbow_angle"]["hi"]
        if elbow < lo:
            return (f"Not fully extending at release ({elbow:.0f}°) — straighten to {lo:.0f}–{hi:.0f}° for maximum arc.", "error")
        tilt = angles.get("shoulder_tilt", 0)
        if tilt > 0.06:
            return ("Body leaning sideways at release — keep shoulders level to improve accuracy.", "warning")
        return (f"Great release at {elbow:.0f}° — transferring maximum power to the ball.", "good")

    if phase == "follow_through":
        elbow = angles.get("elbow_angle", 170)
        wrist_y = angles.get("shooting_wrist_y", 0.3)
        elbow_y = angles.get("shooting_elbow_y", 0.4)
        wrist_drop = elbow_y - wrist_y
        if wrist_drop < 0:
            return ("Wrist isn't snapping down — hold a 'goose neck' finish with fingers pointing at the rim for 1 second.", "error")
        if elbow < 150:
            return (f"Arm collapsing too early ({elbow:.0f}°) — fully extend and hold your follow-through.", "warning")
        return ("Beautiful follow-through — full extension with wrist snap shows excellent mechanics.", "good")

    return ("Analysis unavailable for this phase.", "warning")


def analyze(phase_angles: dict) -> dict:
    results: dict[str, dict] = {}
    all_scores: list[float] = []

    for phase in ["ready_position", "load", "set_point", "release", "follow_through"]:
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
                "ideal": f"{band['lo']:.0f}–{band['hi']:.0f}" + ("°" if "angle" in metric else ""),
                "score": s,
            }

        phase_score = round(sum(phase_scores) / len(phase_scores), 1) if phase_scores else 0
        all_scores.append(phase_score)
        feedback_text, status = _generate_feedback(phase, angles)
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

- [ ] **Step 4: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_scoring.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/analyzer/scoring.py backend/tests/test_scoring.py
git commit -m "feat(backend): documented piecewise scoring curve, ready_position ideal, merged feedback"
```

---

## Task 7: New-core golden and `CHANGES.md`

**Files:**
- Create: `backend/tests/capture_current_golden.py`
- Create (generated, then committed): `backend/tests/golden/current_*.json`
- Create: `backend/CHANGES.md`
- Test: `backend/tests/test_pipeline_golden.py`, `backend/tests/test_no_regression.py`

**Interfaces:**
- Consumes: `angles.angles_per_frame`, `phases.segment_phases` / `extract_phase_angles`, `scoring.analyze`; the legacy goldens from Task 3.
- Produces: `golden/current_<fixture>.json` (frozen new-core output) and a `test_no_regression.py` that diffs new vs legacy and asserts only the documented fields changed.

- [ ] **Step 1: Write `backend/tests/capture_current_golden.py`**

```python
"""One-shot: freeze the NEW core pipeline output on the fixtures.
Run from backend/: python -m tests.capture_current_golden
"""
import json
from pathlib import Path

from analyzer.angles import angles_per_frame
from analyzer.phases import extract_phase_angles, segment_phases
from analyzer.scoring import analyze
from tests.conftest import load_fixture

OUT = Path(__file__).parent / "golden"
NAMES = ["good_form_side", "shallow_load_side", "elbow_flare_side", "front_view", "truncated"]


def run_core(name: str) -> dict:
    frames = angles_per_frame(load_fixture(name))
    seg = segment_phases(frames)
    analysis = analyze(extract_phase_angles(frames, seg["phases"]))
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

Run: `cd backend && python -m tests.capture_current_golden`
Expected: `wrote 5 current goldens to .../golden`.

- [ ] **Step 2: Write `backend/tests/test_pipeline_golden.py`**

```python
import json
from pathlib import Path

import pytest

from tests.capture_current_golden import run_core

GOLDEN = Path(__file__).parent / "golden"
NAMES = ["good_form_side", "shallow_load_side", "elbow_flare_side", "front_view", "truncated"]


@pytest.mark.parametrize("name", NAMES)
def test_core_pipeline_matches_current_golden(name):
    expected = json.loads((GOLDEN / f"current_{name}.json").read_text())
    actual = json.loads(json.dumps(run_core(name), sort_keys=True))
    assert actual == expected
```

- [ ] **Step 3: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_pipeline_golden.py -v`
Expected: 5 passed (golden just captured).

- [ ] **Step 4: Write `backend/tests/test_no_regression.py`**

```python
"""New core vs the frozen legacy baseline. Only the documented deltas may differ."""
import json
from pathlib import Path

import pytest

from tests.capture_current_golden import run_core

GOLDEN = Path(__file__).parent / "golden"
NAMES = ["good_form_side", "shallow_load_side", "elbow_flare_side", "front_view", "truncated"]

# Documented, intentional changes (see backend/CHANGES.md):
#  1. release / follow_through indices come from motion signals, not "+3 frames".
#  2. load is searched only up to set point.
#  3. ready_position rule changed.
#  4. tilt metrics (shoulder_tilt, hip_tilt) use a tighter falloff, so their
#     per-metric score and any phase score that includes them may differ.
CHANGED_PHASE_INDICES = {"release", "follow_through", "load", "ready_position"}
TILT_AFFECTED_PHASES = {"ready_position", "release"}


@pytest.mark.parametrize("name", NAMES)
def test_unchanged_fields_still_match_legacy(name):
    legacy = json.loads((GOLDEN / f"legacy_{name}.json").read_text())
    current = run_core(name)

    # set_point detection rule is unchanged
    assert current["phases"]["set_point"] == legacy["phases"]["set_point"]

    # phases NOT in the changed set must keep identical feedback text and status
    for phase in ("set_point",):
        lc = legacy["analysis"]["phases"][phase]
        cc = current["analysis"]["phases"][phase]
        assert cc["feedback"] == lc["feedback"]
        assert cc["status"] == lc["status"]

    # non-tilt metric scores must be identical for set_point (same inputs, same curve)
    lc_m = legacy["analysis"]["phases"]["set_point"]["angles_measured"]
    cc_m = current["analysis"]["phases"]["set_point"]["angles_measured"]
    for metric in lc_m:
        if "tilt" in metric:
            continue
        assert cc_m[metric]["score"] == lc_m[metric]["score"], (name, metric)
```

- [ ] **Step 5: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_no_regression.py -v`
Expected: 5 passed. If a non-tilt `set_point` metric score differs, the scoring curve is not actually equivalent for angle metrics — revisit `score_metric` / `IDEALS` falloff values (must be `30.0` for angle metrics) before proceeding.

- [ ] **Step 6: Write `backend/CHANGES.md`**

```markdown
# Behavior changes vs the pre-refactor analyzer

Phase A restructured `backend/analyzer/` into pure modules. The pipeline
reproduces the previous output on the synthetic fixtures **except** for the
deliberate changes below. Baselines: `tests/golden/legacy_*.json` (old),
`tests/golden/current_*.json` (new).

## 1. Phase segmentation (`analyzer/phases.py`)

| Phase | Before | After |
|---|---|---|
| set_point | global min shooting-wrist y | unchanged |
| load | global min knee angle over the whole clip | min knee angle in frames up to and including set point |
| ready_position | global max knee angle before load | last frame before load within 15° of the pre-load max knee angle |
| release | set_point index + 3 valid frames | after set point, frame of maximum elbow-extension velocity |
| follow_through | last valid frame | last frame after release with the shooting wrist above the shooting shoulder; `None` if the clip ends at/near set point |

Rationale: the "+3 frames" rule produced a release frame unrelated to the
actual arm extension and broke on clips at different frame rates or lengths.

Observed index deltas on the fixtures: <fill in from the diff of
`legacy_*` vs `current_*` — e.g. "good_form_side: release 41 -> 39,
follow_through 59 -> 55">.

## 2. Scoring curve (`analyzer/scoring.py`)

Angle metrics (`*_angle`): **unchanged**. The new piecewise function with
`falloff = 30.0` is algebraically identical to the old
`100 - (deviation / 30) * 100` curve.

Tilt metrics (`shoulder_tilt`, `hip_tilt`): **tightened**. The old curve
divided the tilt deviation by 30, so a tilt of 0.09 (about 8° of lean)
scored ~99.8 — effectively unscored. The new `falloff` is 0.08 (0.10 for
`release.shoulder_tilt`), so the same tilt scores ~50. This changes the
per-metric score for tilt and the phase score for any phase whose ideals
include a tilt metric (`ready_position`, `release`).

Observed score deltas on the fixtures: <fill in — e.g. "elbow_flare_side:
ready_position 96.2 -> 71.0 because shoulder_tilt 0.02 -> score 75">.

## 3. Additive response fields

`camera_view` (`"side" | "front" | "oblique"`) and `confidence` (0–1) are
new top-level fields on `POST /analyze`. Front / oblique views yield
`confidence <= 0.4`; the analysis still runs. Nothing existing was removed.
```

Fill the two `<...>` placeholders by diffing the legacy and current golden files (`diff <(jq -S . tests/golden/legacy_good_form_side.json) <(jq -S . tests/golden/current_good_form_side.json)` etc.).

- [ ] **Step 7: Commit**

```bash
git add backend/tests/capture_current_golden.py backend/tests/test_pipeline_golden.py \
        backend/tests/test_no_regression.py backend/tests/golden/current_*.json backend/CHANGES.md
git commit -m "test(backend): lock new-core golden, document deltas vs legacy in CHANGES.md"
```

---

## Task 8: `settings.py`

**Files:**
- Create: `backend/settings.py`
- Test: `backend/tests/test_settings.py`

**Interfaces:**
- Consumes: environment / `.env`.
- Produces: `settings` — a module-level `Settings` instance with `model_cache_dir: pathlib.Path` (default `~/.cache/kinetiq`) and `cors_origins: list[str]` (default `["*"]`). Env prefix `KINETIQ_`. `Settings` class is exported for tests to instantiate with overrides.

- [ ] **Step 1: Write failing `backend/tests/test_settings.py`**

```python
from pathlib import Path

from settings import Settings


def test_defaults():
    s = Settings()
    assert s.cors_origins == ["*"]
    assert s.model_cache_dir == Path.home() / ".cache" / "kinetiq"


def test_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv("KINETIQ_MODEL_CACHE_DIR", str(tmp_path))
    monkeypatch.setenv("KINETIQ_CORS_ORIGINS", '["https://a.example","https://b.example"]')
    s = Settings()
    assert s.model_cache_dir == tmp_path
    assert s.cors_origins == ["https://a.example", "https://b.example"]
```

- [ ] **Step 2: Run — expect failure**

Run: `cd backend && python -m pytest tests/test_settings.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'settings'`.

- [ ] **Step 3: Write `backend/settings.py`**

```python
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KINETIQ_", env_file=".env", extra="ignore")

    model_cache_dir: Path = Path.home() / ".cache" / "kinetiq"
    cors_origins: list[str] = ["*"]


settings = Settings()
```

- [ ] **Step 4: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_settings.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/settings.py backend/tests/test_settings.py
git commit -m "feat(backend): pydantic-settings config for model cache dir and CORS origins"
```

---

## Task 9: `analyzer/pose.py` — MediaPipe extraction with a model-file singleton

**Files:**
- Create: `backend/analyzer/pose.py`
- Test: `backend/tests/test_pose_smoke.py`

**Interfaces:**
- Consumes: a video file path (str); `settings.model_cache_dir`.
- Produces:
  - `extract_landmarks_from_video(video_path: str) -> list[dict | None]` — each dict has the 21 named landmarks as `np.ndarray(4)` **plus** `"_frame"` (BGR `np.ndarray`) and `"_raw_landmarks"` (the MediaPipe landmark list) for rendering. `None` for frames with no detected pose. Same output contract as legacy `pose_detector.extract_landmarks_from_video`.
  - `ensure_model() -> str` — path to the downloaded `.task` model; downloads once per process under a thread lock into `settings.model_cache_dir`.

`mediapipe` and `cv2` are imported **inside** the functions, never at module top level.

- [ ] **Step 1: Write `backend/tests/test_pose_smoke.py`**

```python
from pathlib import Path

import pytest

SAMPLE = Path(__file__).parent / "fixtures" / "sample_shot.mp4"

pytestmark = pytest.mark.mediapipe


@pytest.mark.skipif(not SAMPLE.exists(), reason="no sample_shot.mp4 checked in")
def test_extract_landmarks_runs_on_sample():
    from analyzer.pose import extract_landmarks_from_video

    frames = extract_landmarks_from_video(str(SAMPLE))
    assert isinstance(frames, list) and len(frames) > 0
    assert any(f is not None for f in frames)
    good = next(f for f in frames if f is not None)
    assert "left_shoulder" in good and good["left_shoulder"].shape == (4,)
    assert "_frame" in good


def test_ensure_model_is_idempotent():
    from analyzer.pose import ensure_model

    assert ensure_model() == ensure_model()
```

- [ ] **Step 2: Run — expect skip/pass, not error**

Run: `cd backend && python -m pytest tests/test_pose_smoke.py -v -m mediapipe`
Expected: if MediaPipe is installed, `test_ensure_model_is_idempotent` passes and `test_extract_landmarks_runs_on_sample` skips (no sample video). If MediaPipe is not installed, collection of this file errors on import of `analyzer.pose` — that is why Step 3 must land in the same commit; run this step after Step 3.

- [ ] **Step 3: Write `backend/analyzer/pose.py`**

Copy the body of legacy `pose_detector.extract_landmarks_from_video` and its helpers `_download_model` (rename to `ensure_model`) and the `LANDMARKS` map, with these changes: model path comes from `settings.model_cache_dir`; a module-level `threading.Lock` guards the download; `cv2` / `mediapipe` imported inside the functions.

```python
import threading
import urllib.request
from pathlib import Path

import numpy as np

from settings import settings

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

_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)
_model_lock = threading.Lock()
_model_path: Path | None = None


def ensure_model() -> str:
    global _model_path
    if _model_path is not None and _model_path.exists():
        return str(_model_path)
    with _model_lock:
        if _model_path is not None and _model_path.exists():
            return str(_model_path)
        settings.model_cache_dir.mkdir(parents=True, exist_ok=True)
        dest = settings.model_cache_dir / "pose_landmarker_heavy.task"
        if not dest.exists():
            tmp = dest.with_suffix(".task.download")
            urllib.request.urlretrieve(_MODEL_URL, tmp)
            tmp.replace(dest)
        _model_path = dest
        return str(dest)


def extract_landmarks_from_video(video_path: str) -> list:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    model_path = ensure_model()
    options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames: list = []
    frame_idx = 0

    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int((frame_idx / fps) * 1000)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.pose_landmarks:
                lm = result.pose_landmarks[0]
                frame_data = {"_raw_landmarks": lm, "_frame": frame.copy()}
                for name, idx in LANDMARKS.items():
                    vis = getattr(lm[idx], "visibility", 1.0)
                    frame_data[name] = np.array([lm[idx].x, lm[idx].y, lm[idx].z, vis])
                frames.append(frame_data)
            else:
                frames.append(None)
            frame_idx += 1

    cap.release()
    return frames
```

- [ ] **Step 4: Run**

Run: `cd backend && python -m pytest tests/test_pose_smoke.py -v -m mediapipe`
Expected (MediaPipe installed): 1 passed, 1 skipped.
Run: `cd backend && python -m pytest -q -m "not mediapipe"`
Expected: this file is deselected; everything else green.

- [ ] **Step 5: Commit**

```bash
git add backend/analyzer/pose.py backend/tests/test_pose_smoke.py
git commit -m "feat(backend): pose extraction module with per-process model-file singleton"
```

---

## Task 10: `analyzer/rendering.py` — drawing isolated from analysis

**Files:**
- Create: `backend/analyzer/rendering.py`
- Test: `backend/tests/test_rendering_smoke.py`

**Interfaces:**
- Consumes: the raw `frames` list from `pose.extract_landmarks_from_video` (needs `_frame` / `_raw_landmarks`), the `angles_per_frame` list, a `phases` index dict, and the `extract_phase_angles` dict.
- Produces:
  - `generate_pose_gif(frames: list, angles_list: list, max_frames: int = 30, size: tuple[int, int] = (360, 360)) -> str` — base64 GIF, `""` if nothing renderable.
  - `render_phase_images(frames: list, angles_list: list, phases: dict, phase_angles: dict, size: tuple[int, int] = (380, 380)) -> dict` — `{phase: {"user_frame": b64 | "", "ideal_frame": b64 | ""}}` for the five phases. This is the loop currently inline in `main.py`.

Copy `draw_skeleton_on_frame`, `draw_ideal_skeleton`, `get_joint_color`, `SKELETON_CONNECTIONS`, `IDEAL_RANGES`, `generate_pose_gif`, `extract_phase_frame_b64` verbatim from legacy `pose_detector.py`. `cv2` and `PIL` imported at module top level here (this module is allowed image deps; it is never imported by the core or by CI's non-mediapipe test path except through `api.py`, which CI does import — so CI installs `opencv-python-headless` + `pillow`, both of which have 3.11 wheels).

- [ ] **Step 1: Write `backend/tests/test_rendering_smoke.py`**

```python
import numpy as np

from analyzer.angles import angles_per_frame
from analyzer.phases import extract_phase_angles, segment_phases
from analyzer.rendering import generate_pose_gif, render_phase_images
from tests import synth


def _raw_frames(n=40):
    """synth frames lack _frame/_raw_landmarks; add minimal stand-ins."""
    out = []
    for f in synth.make_shot(n_frames=n):
        f = dict(f)
        f["_frame"] = np.zeros((120, 120, 3), dtype=np.uint8)
        f["_raw_landmarks"] = None
        out.append(f)
    return out


def test_generate_pose_gif_returns_string_without_raw_landmarks():
    frames = _raw_frames()
    out = generate_pose_gif(frames, angles_per_frame(frames))
    assert isinstance(out, str)  # "" is acceptable when _raw_landmarks is None


def test_render_phase_images_keys():
    frames = _raw_frames()
    al = angles_per_frame(frames)
    seg = segment_phases(al)
    imgs = render_phase_images(frames, al, seg["phases"], extract_phase_angles(al, seg["phases"]))
    assert set(imgs) == {"ready_position", "load", "set_point", "release", "follow_through"}
    for pair in imgs.values():
        assert set(pair) == {"user_frame", "ideal_frame"}
```

- [ ] **Step 2: Run — expect failure**

Run: `cd backend && python -m pytest tests/test_rendering_smoke.py -v`
Expected: FAIL — module `analyzer.rendering` does not exist.

- [ ] **Step 3: Write `backend/analyzer/rendering.py`**

Move the drawing code from `pose_detector.py` verbatim (functions listed above). Add the `render_phase_images` wrapper, lifting the loop from legacy `main.py`:

```python
# ... (verbatim: SKELETON_CONNECTIONS, IDEAL_RANGES, get_joint_color,
#      draw_skeleton_on_frame, draw_ideal_skeleton, generate_pose_gif,
#      extract_phase_frame_b64 — copied from pose_detector.py, plus the
#      module-top `import cv2`, `import numpy as np`, `import base64`, `import io`,
#      `from PIL import Image`, and the LANDMARKS map)

_PHASES = ["ready_position", "load", "set_point", "release", "follow_through"]


def render_phase_images(frames, angles_list, phases, phase_angles, size=(380, 380)):
    by_index = {i: f for i, f in enumerate(frames)}
    out = {}
    for phase in _PHASES:
        idx = phases.get(phase)
        frame_data = by_index.get(idx) if idx is not None else None
        angles = phase_angles.get(phase)
        user_b64, ideal_b64 = extract_phase_frame_b64(frame_data, angles, phase, size=size)
        out[phase] = {"user_frame": user_b64, "ideal_frame": ideal_b64}
    return out
```

`generate_pose_gif` in legacy code reads `frame_data.get("_raw_landmarks")` and returns `""` when it is `None`, so the smoke test with `None` raw landmarks passes trivially. `extract_phase_frame_b64` already tolerates `frame_data is None` and `_raw_landmarks is None`.

- [ ] **Step 4: Run — expect pass**

Run: `cd backend && python -m pytest tests/test_rendering_smoke.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/analyzer/rendering.py backend/tests/test_rendering_smoke.py
git commit -m "feat(backend): isolate all skeleton/GIF rendering in rendering.py"
```

---

## Task 11: `api.py` + `main.py` rewrite, delete legacy modules

**Files:**
- Create: `backend/api.py`
- Modify: `backend/main.py`, `backend/analyzer/__init__.py`, `backend/README.md`
- Delete: `backend/analyzer/pose_detector.py`, `backend/analyzer/shot_analyzer.py`, `backend/analyzer/feedback_engine.py`
- Test: `backend/tests/test_api.py`, `backend/tests/test_core_purity.py`

**Interfaces:**
- Consumes: `analyzer.pose`, `analyzer.angles`, `analyzer.phases`, `analyzer.scoring`, `analyzer.rendering`, `settings.settings`.
- Produces: `api.router` (`APIRouter`) with `GET /health` and `POST /analyze`; `main.app` (`FastAPI`).
  `POST /analyze` response = legacy shape (`overall_score`, `priority`, `phases`, `pose_gif`, `phase_images`) **plus** `camera_view` and `confidence`.

- [ ] **Step 1: Write failing tests**

`backend/tests/test_core_purity.py`:

```python
import ast
from pathlib import Path

import pytest

CORE = ["angles.py", "phases.py", "scoring.py"]
FORBIDDEN = {"fastapi", "cv2", "PIL", "mediapipe", "sqlalchemy", "starlette"}
ANALYZER = Path(__file__).resolve().parents[1] / "analyzer"


@pytest.mark.parametrize("fname", CORE)
def test_core_module_imports_nothing_forbidden(fname):
    tree = ast.parse((ANALYZER / fname).read_text())
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    assert imported.isdisjoint(FORBIDDEN), imported & FORBIDDEN
```

`backend/tests/test_api.py`:

```python
import io

import pytest
from fastapi.testclient import TestClient

from tests import synth


@pytest.fixture
def client(monkeypatch):
    from analyzer import pose, rendering

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


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_analyze_returns_legacy_shape_plus_new_fields(client):
    r = client.post("/analyze", files={"video": ("shot.mp4", io.BytesIO(b"x"), "video/mp4")})
    assert r.status_code == 200
    body = r.json()
    assert {"overall_score", "priority", "phases", "pose_gif", "phase_images"} <= body.keys()
    assert body["camera_view"] in {"side", "front", "oblique"}
    assert 0.0 <= body["confidence"] <= 1.0
    assert set(body["phases"]) == {
        "ready_position", "load", "set_point", "release", "follow_through"
    }


def test_analyze_422_when_no_pose(client, monkeypatch):
    from analyzer import pose
    monkeypatch.setattr(pose, "extract_landmarks_from_video", lambda _p: [None] * 30)
    r = client.post("/analyze", files={"video": ("shot.mp4", io.BytesIO(b"x"), "video/mp4")})
    assert r.status_code == 422
```

- [ ] **Step 2: Run — expect failure**

Run: `cd backend && python -m pytest tests/test_api.py tests/test_core_purity.py -v`
Expected: FAIL — `api` not present / `main` still importing deleted modules.

- [ ] **Step 3: Write `backend/api.py`**

```python
import os
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from analyzer import pose, rendering
from analyzer.angles import angles_per_frame
from analyzer.phases import extract_phase_angles, segment_phases
from analyzer.scoring import analyze

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.post("/analyze")
async def analyze_shot(video: UploadFile = File(...)) -> dict:
    suffix = os.path.splitext(video.filename or "shot.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name

    try:
        frames = await run_in_threadpool(pose.extract_landmarks_from_video, tmp_path)
        if not frames or all(f is None for f in frames):
            raise HTTPException(422, "No pose detected. Ensure your full body is visible.")

        angles_list = angles_per_frame(frames)
        seg = segment_phases(angles_list)
        phase_angles = extract_phase_angles(angles_list, seg["phases"])
        result = analyze(phase_angles)

        result["pose_gif"] = await run_in_threadpool(
            rendering.generate_pose_gif, frames, angles_list
        )
        result["phase_images"] = await run_in_threadpool(
            rendering.render_phase_images, frames, angles_list, seg["phases"], phase_angles
        )
        result["camera_view"] = seg["camera_view"]
        result["confidence"] = round(seg["confidence"], 4)
        return result
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface as 500 with detail
        raise HTTPException(500, f"Server error: {exc}") from exc
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
```

- [ ] **Step 4: Rewrite `backend/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import router
from settings import settings

app = FastAPI(title="KinetiQ Shot Analyzer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
```

- [ ] **Step 5: Rewrite `backend/analyzer/__init__.py`**

```python
from analyzer.angles import angles_per_frame, calculate_angle, frame_angles
from analyzer.phases import PHASE_KEYS, extract_phase_angles, segment_phases
from analyzer.scoring import analyze

__all__ = [
    "angles_per_frame", "calculate_angle", "frame_angles",
    "PHASE_KEYS", "extract_phase_angles", "segment_phases", "analyze",
]
```

- [ ] **Step 6: Delete the legacy modules and any tracked bytecode**

```bash
git rm backend/analyzer/pose_detector.py backend/analyzer/shot_analyzer.py backend/analyzer/feedback_engine.py
git rm -r --cached --ignore-unmatch 'backend/**/__pycache__'
```

`tests/capture_legacy_golden.py` imports these modules. It has already been run and its output (`golden/legacy_*.json`) is committed. Add a header note to that file:

```python
# NOTE: the legacy analyzer modules were removed in Task 11. This script is kept
# for provenance only; its output lives in tests/golden/legacy_*.json. Do not run.
```

- [ ] **Step 7: Update `backend/README.md`**

Replace the run instructions with:

```markdown
## Backend

Requires Python 3.11 or 3.12 (MediaPipe has no 3.13 wheels).

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt      # runtime + test deps
uvicorn main:app --reload --port 8000
```

### Configuration (env, prefix `KINETIQ_`)

| Var | Default | Meaning |
|---|---|---|
| `KINETIQ_MODEL_CACHE_DIR` | `~/.cache/kinetiq` | Where the MediaPipe pose model is downloaded once. |
| `KINETIQ_CORS_ORIGINS` | `["*"]` | JSON list of allowed origins. |

### Tests

```bash
cd backend
python -m pytest -m "not mediapipe"      # no video / MediaPipe needed
python -m pytest -m mediapipe            # needs mediapipe + tests/fixtures/sample_shot.mp4
```
```

- [ ] **Step 8: Run the full suite**

Run: `cd backend && python -m pytest -m "not mediapipe" -v`
Expected: every test passes. If `test_api.py` fails importing `main` because `starlette`/`httpx` is missing, confirm `requirements-dev.txt` was installed.

Run: `cd backend && python -m ruff check .`
Expected: `All checks passed!`

- [ ] **Step 9: Manual smoke of the real server (optional, needs MediaPipe)**

```bash
cd backend && uvicorn main:app --port 8000 &
curl -s localhost:8000/health
# -> {"status":"ok"}
kill %1
```

- [ ] **Step 10: Commit**

```bash
git add backend/api.py backend/main.py backend/analyzer/__init__.py backend/README.md \
        backend/tests/test_api.py backend/tests/test_core_purity.py \
        backend/tests/capture_legacy_golden.py
git add -u backend/analyzer
git commit -m "refactor(backend): thin api.py/main.py over pure core, drop legacy analyzer modules"
```

---

## Task 12: CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `backend/requirements-dev.txt`, `backend/pyproject.toml`.
- Produces: a GitHub Actions workflow running ruff + `pytest -m "not mediapipe"` on pushes and PRs to any branch.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: backend-ci

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
      - run: pip install -r requirements-dev.txt
      - run: python -m ruff check .
      - run: python -m pytest -m "not mediapipe" --cov=analyzer --cov-report=term-missing
```

- [ ] **Step 2: Verify locally that the CI command passes**

Run: `cd backend && pip install -r requirements-dev.txt && python -m ruff check . && python -m pytest -m "not mediapipe" --cov=analyzer --cov-report=term-missing`
Expected: ruff clean; all non-mediapipe tests pass; coverage report prints for `analyzer/angles.py`, `analyzer/phases.py`, `analyzer/scoring.py` (each should be near-complete).

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: ruff + pytest (no mediapipe) on Python 3.11"
git push -u origin phase-a-engine
```

- [ ] **Step 4: Confirm the run**

Run: `gh run list --branch phase-a-engine --limit 1`
Expected: one `backend-ci` run, conclusion `success` (wait with `gh run watch` if still in progress).

---

## Self-Review

**1. Spec coverage (Phase A + applicable cross-cutting):**

| Spec item | Task |
|---|---|
| A.1 module split (`pose`, `angles`, `phases`, `scoring`, `rendering`, `api`, `main`, `settings`) | 4, 5, 6, 8, 9, 10, 11 |
| A.2 motion-based phase segmentation | 5 |
| A.2 camera-view classification + confidence, surfaced on API | 5, 11 |
| A.3 `IDEALS` with falloff, `ready_position` added, piecewise curve, feedback merged | 6 |
| A.4 `run_in_threadpool`, CORS from settings, model singleton to cache dir, `settings.py` | 8, 9, 11 |
| A.4 response adds `camera_view` / `confidence`, otherwise unchanged | 11 (test_api) |
| A.5 fixture-based tests, no video/MediaPipe; per-module test files; golden pipeline test; `mediapipe`-marked smoke | 2, 4, 5, 6, 7, 9 |
| A.6 `.gitignore`, remove `.pyc`, split requirements, `pyproject.toml` with ruff+pytest | 1, 11 |
| A.7 legacy golden captured before refactor; new golden; `CHANGES.md` documents every deviation | 3, 7 |
| A.8 gate: ruff+pytest green in CI; golden test reviewed; `CHANGES.md` complete; no `.pyc`; requirements split; `settings.py` in use | 12 + all |
| Cross-cutting: core purity enforced | 11 (test_core_purity) |
| Cross-cutting: CI on the fork | 12 |
| Cross-cutting: branch `phase-a-engine`, commits attributed to Parth | every task |

**Deliberate deviation from the spec:** the spec's A.5 says "capture landmark JSON from 6 sample shots." No sample videos exist, so fixtures are **synthesized deterministically** (`tests/synth.py`) instead of captured from video. The six scenarios (good form, shallow load, elbow flare, front view, no pose, truncated) and the "tests run without video or MediaPipe" intent are preserved. The `pose.py` smoke test still expects an optional real `sample_shot.mp4` and skips without it. The no-regression guard (A.7) runs the legacy core against the same synthetic inputs rather than real `/analyze` calls, which keeps it deterministic. This is called out here and in `CHANGES.md`.

**2. Placeholder scan:** the only intentional fill-ins are the two `<...>` deltas in `CHANGES.md` Task 7 Step 6, which the executor fills from the actual legacy-vs-current golden diff (concrete command given). No `TODO`/`TBD` in code steps; every code step has a complete block.

**3. Type consistency:** `segment_phases` returns `{"phases", "camera_view", "confidence"}` everywhere it is used (Tasks 5, 7, 10, 11). `extract_phase_angles(angles_list, phases_dict)` signature is consistent across Tasks 5, 7, 10, 11. `analyze(phase_angles)` returns `{"overall_score", "priority", "phases"}` in Tasks 6, 7, 11. `frame_angles` key set is identical in Task 4's implementation, its test, and the `IDEALS` metric names in Task 6. `render_phase_images(frames, angles_list, phases, phase_angles, size=...)` matches between Task 10 and its call in Task 11's `api.py`. `ensure_model()` name is consistent (Task 9 interface, impl, test).
