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
