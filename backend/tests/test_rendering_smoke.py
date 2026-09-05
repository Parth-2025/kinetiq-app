import numpy as np

from analyzer.sports.basketball import BasketballPlugin
from analyzer.sports.basketball.rendering import generate_pose_gif, render_phase_images
from tests import synth

_PLUGIN = BasketballPlugin()


def _pm(metrics, phases):
    order = ["ready_position", "load", "set_point", "release", "follow_through"]
    return {p: (metrics[phases[p]] if phases.get(p) is not None else None) for p in order}


def _raw_frames(n=40):
    """synth frames lack _frame/_raw_landmarks; add minimal stand-ins."""
    out = []
    for f in synth.make_shot(n_frames=n):
        f = dict(f)
        f["_frame"] = np.zeros((120, 120, 3), dtype=np.uint8)
        f["_raw_landmarks"] = None
        out.append(f)
    return out


def test_generate_pose_gif_returns_string_without_raw_landmarks():
    frames = _raw_frames()
    out = generate_pose_gif(frames, _PLUGIN.frame_metrics(frames))
    assert isinstance(out, str)  # "" is acceptable when _raw_landmarks is None


def test_render_phase_images_keys():
    frames = _raw_frames()
    al = _PLUGIN.frame_metrics(frames)
    seg = _PLUGIN.segment(al)
    imgs = render_phase_images(frames, al, seg["phases"], _pm(al, seg["phases"]))
    assert set(imgs) == {"ready_position", "load", "set_point", "release", "follow_through"}
    for pair in imgs.values():
        assert set(pair) == {"user_frame", "ideal_frame"}
