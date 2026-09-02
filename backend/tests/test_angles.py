import pytest
from analyzer.angles import angles_per_frame, calculate_angle, frame_angles

from tests import synth
from tests.conftest import FIXTURE_NAMES, load_fixture


def test_calculate_angle_right_angle():
    a = [0.0, 1.0, 0.0]
    b = [0.0, 0.0, 0.0]
    c = [1.0, 0.0, 0.0]
    assert abs(calculate_angle(a, b, c) - 90.0) < 1e-6


def test_calculate_angle_straight_line():
    assert abs(calculate_angle([0, 2, 0], [0, 1, 0], [0, 0, 0]) - 180.0) < 0.1


def test_frame_angles_keys():
    frame = synth.make_shot(n_frames=10)[5]
    a = frame_angles(frame)
    assert set(a) == {
        "shooting_side", "elbow_angle", "knee_angle", "hip_angle",
        "guide_elbow_angle", "shoulder_tilt", "hip_tilt",
        "shooting_wrist_y", "shooting_elbow_y", "shooting_shoulder_y",
        "torso_width", "torso_height",
    }


def test_shooting_side_follows_higher_wrist():
    right = frame_angles(synth.make_shot(shooting_side="right")[30])
    left = frame_angles(synth.make_shot(shooting_side="left")[30])
    assert right["shooting_side"] == "right"
    assert left["shooting_side"] == "left"


def test_front_view_has_larger_torso_width():
    side = frame_angles(synth.make_shot(view="side")[0])
    front = frame_angles(synth.make_shot(view="front")[0])
    assert front["torso_width"] > side["torso_width"] + 0.1
    assert side["torso_height"] > 0.1


def test_angles_per_frame_passes_none_through():
    out = angles_per_frame([None, synth.make_shot(n_frames=3)[0], None])
    assert out[0] is None and out[2] is None
    assert isinstance(out[1], dict)


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_every_fixture_computes_without_error(name):
    out = angles_per_frame(load_fixture(name))
    if name == "no_pose":
        assert all(x is None for x in out)
    else:
        assert any(isinstance(x, dict) for x in out)
