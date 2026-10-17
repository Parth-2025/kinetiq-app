import math
import uuid

from studio.motion_contract import CanonicalFrame, CanonicalMotionSession, JOINT_NAMES
from studio.rig_fit import build_display_rig


def _motion(frames_points, qualities=None):
    qualities = qualities or ["usable"] * len(frames_points)
    frames = [CanonicalFrame(time_s=i * 0.1, source_sample_id=None, sample_index=i,
        quality=quality, positions_m=points, visibility=[1.0 if p is not None else None for p in points])
        for i, (points, quality) in enumerate(zip(frames_points, qualities))]
    return CanonicalMotionSession(session_id=uuid.UUID(int=1), subject_athlete_id=uuid.UUID(int=2),
        provider="mediapipe-heavy-world", provider_version=None, provider_model_sha256="a" * 64,
        source_record_version="studio-motion-1", source_coordinate_convention="mediapipe_world_hip_relative_meters",
        time_basis="decoded_presentation_time", source_retention="deleted", reconstruction_revision_sha256="b" * 64,
        joint_names=list(JOINT_NAMES), frames=frames)


def _pose(scale=1.0, rotation=0.0, missing=()):
    # Symmetric synthetic geometry in contract coordinates; every bone has a nonzero length.
    points = [None] * 33
    coords = {
        23: (-.1, 0, 0), 24: (.1, 0, 0), 11: (-.2, .55, 0), 12: (.2, .55, 0),
        13: (-.5, .50, 0), 14: (.5, .50, 0), 15: (-.8, .45, 0), 16: (.8, .45, 0),
        25: (-.1, -.45, 0), 26: (.1, -.45, 0), 27: (-.1, -.9, 0), 28: (.1, -.9, 0),
        31: (-.1, -.95, .2), 32: (.1, -.95, .2), 0: (0, .8, 0),
    }
    for index, (x, y, z) in coords.items():
        points[index] = [scale * (x * math.cos(rotation) - z * math.sin(rotation)), scale * y,
                         scale * (x * math.sin(rotation) + z * math.cos(rotation))]
    for index in missing:
        points[index] = None
    return points


def _length(a, b):
    return math.dist(a, b)


def test_lengths_are_jitter_stable_median_and_measurements_are_context_only():
    motion = _motion([_pose(scale=scale) for scale in (.998, 1.001, 1.0, 1.002, 1.0)])
    original = motion.model_dump(mode="json")
    rig = build_display_rig(motion, {"height_cm": 190, "wingspan_cm": 204, "provenance": "coach_measured", "weight_kg": 88})
    left_arm = rig["joints"][6]
    assert left_arm["support_samples"] == 5
    assert left_arm["length_m"] == pytest_approx(math.hypot(.3, .05), abs=.002)
    assert rig["measurement_context"] == {"height_cm": 190, "wingspan_cm": 204, "provenance": "coach_measured"}
    assert rig["measurement_usage"] == "context_only"
    assert rig["source_analysis_sha256"] and motion.model_dump(mode="json") == original


def pytest_approx(value, **kwargs):
    # Keep this file's lightweight contract checks explicit without importing database fixtures.
    import pytest
    return pytest.approx(value, **kwargs)


def test_single_outlier_does_not_shift_median_and_rig_is_reproducible():
    poses = [_pose() for _ in range(3)] + [_pose(scale=2.0)] + [_pose() for _ in range(2)]
    motion = _motion(poses)
    first = build_display_rig(motion)
    second = build_display_rig(motion)
    assert first == second
    assert first["joints"][6]["length_m"] == pytest_approx(math.hypot(.3, .05))
    assert first["joints"][6]["support_samples"] == 6


def test_observed_direction_drives_pose_but_fixed_lengths_survive_rotation():
    motion = _motion([_pose() for _ in range(3)] + [_pose(rotation=math.pi / 2)])
    rig = build_display_rig(motion)
    bind_len = rig["joints"][6]["length_m"]
    posed = rig["frames"][-1]["positions_m"]
    shoulder_to_elbow = [posed[6][i] - posed[4][i] for i in range(3)]
    assert _length(posed[4], posed[6]) == pytest_approx(bind_len)
    assert abs(shoulder_to_elbow[2]) > abs(shoulder_to_elbow[0])


def test_missing_parent_or_limb_hides_descendants_and_no_pose_multipeople_are_null():
    missing_left_shoulder = _pose(missing=(11,))
    no_pose = _pose()
    other_person = _pose()
    motion = _motion([_pose(), _pose(), _pose(), missing_left_shoulder, no_pose, other_person],
                     ["usable", "usable", "usable", "partial_body_or_occlusion", "no_pose", "multiple_people"])
    rig = build_display_rig(motion)
    posed = rig["frames"][3]["positions_m"]
    assert posed[4] is None and posed[6] is None and posed[8] is None
    assert all(p is None for p in rig["frames"][4]["positions_m"])
    assert all(p is None for p in rig["frames"][5]["positions_m"])


def test_missing_hip_disables_root_and_unsupported_branch_with_fewer_than_three_samples():
    points = [_pose() for _ in range(3)]
    for pointset in points[1:]:
        pointset[24] = None
    # Right arm has only two valid complete observations, so it and descendants remain hidden.
    for pointset in points[1:]:
        pointset[14] = pointset[16] = None
    rig = build_display_rig(_motion(points))
    assert rig["joints"][7]["length_m"] is None
    assert rig["joints"][9]["rest_position_m"] is None
    assert rig["frames"][1]["positions_m"][0] is None
    assert rig["frames"][1]["positions_m"][3] is None


def test_no_supported_root_and_zero_pose_are_explicitly_unsupported():
    points = [_pose(missing=(23,)) for _ in range(3)]
    rig = build_display_rig(_motion(points))
    assert rig["status"] == "unsupported"
    assert all(frame["positions_m"][0] is None for frame in rig["frames"])
