import json
from pathlib import Path

import numpy as np
import pytest

from tests.conftest_db import as_user, client, db_session, pg_engine  # noqa: F401

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
