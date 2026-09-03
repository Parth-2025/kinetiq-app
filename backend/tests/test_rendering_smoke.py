import numpy as np

from analyzer.angles import angles_per_frame
from analyzer.phases import extract_phase_angles, segment_phases
from analyzer.rendering import generate_pose_gif, render_phase_images
from tests import synth


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
    out = generate_pose_gif(frames, angles_per_frame(frames))
    assert isinstance(out, str)  # "" is acceptable when _raw_landmarks is None


def test_render_phase_images_keys():
    frames = _raw_frames()
    al = angles_per_frame(frames)
    seg = segment_phases(al)
    imgs = render_phase_images(frames, al, seg["phases"], extract_phase_angles(al, seg["phases"]))
    assert set(imgs) == {"ready_position", "load", "set_point", "release", "follow_through"}
    for pair in imgs.values():
        assert set(pair) == {"user_frame", "ideal_frame"}
