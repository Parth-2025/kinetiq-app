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
