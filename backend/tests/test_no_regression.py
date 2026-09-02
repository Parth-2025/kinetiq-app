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
