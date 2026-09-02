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
