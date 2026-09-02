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
