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
