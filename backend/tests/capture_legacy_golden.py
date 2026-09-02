# NOTE: the legacy analyzer modules were removed in Task 11. This script is kept
# for provenance only; its output lives in tests/golden/legacy_*.json. Do not run.
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
