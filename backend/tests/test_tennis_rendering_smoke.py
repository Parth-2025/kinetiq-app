import numpy as np

from analyzer.sports.tennis.metrics import frame_metrics
from analyzer.sports.tennis.phases import PHASE_ORDER, segment
from analyzer.sports.tennis.rendering import draw_ideal_skeleton, render_all
from tests import synth


def _raw(n=48):
    out = []
    for f in synth.make_serve(n_frames=n):
        f = dict(f)
        f["_frame"] = np.zeros((120, 120, 3), dtype=np.uint8)
        f["_raw_landmarks"] = None
        out.append(f)
    return out


def _pm(metrics, phases):
    return {p: (metrics[phases[p]] if phases.get(p) is not None else None)
            for p in PHASE_ORDER}


def test_draw_ideal_skeleton_every_phase():
    for phase in PHASE_ORDER:
        img = draw_ideal_skeleton(phase, {"hitting_elbow_angle": 165.0})
        assert isinstance(img, np.ndarray)
        assert img.shape == (460, 460, 3)
        assert img.dtype == np.uint8


def test_draw_ideal_skeleton_unknown_phase_falls_back():
    img = draw_ideal_skeleton("nonsense", {})
    assert img.shape == (460, 460, 3)


def test_render_all_shape():
    frames = _raw()
    m = frame_metrics(frames)
    seg = segment(m)
    out = render_all(frames, m, seg["phases"], _pm(m, seg["phases"]))
    assert set(out) == {"pose_gif", "phase_images"}
    assert set(out["phase_images"]) == set(PHASE_ORDER)
    for pair in out["phase_images"].values():
        assert set(pair) == {"user_frame", "ideal_frame"}
        assert isinstance(pair["user_frame"], str)
        assert isinstance(pair["ideal_frame"], str)
    assert any(p["ideal_frame"] for p in out["phase_images"].values())


def test_render_all_tolerates_none_phase():
    frames = _raw()
    m = frame_metrics(frames)
    seg = segment(m)
    phases = dict(seg["phases"])
    phases["cocking"] = None
    out = render_all(frames, m, phases, _pm(m, phases))
    assert out["phase_images"]["cocking"]["user_frame"] == ""
    assert out["phase_images"]["cocking"]["ideal_frame"]
