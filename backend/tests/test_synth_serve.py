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
