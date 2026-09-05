from analyzer.geometry import LANDMARKS, calculate_angle


def test_calculate_angle_right_angle():
    assert abs(calculate_angle([0.0, 1.0, 0.0], [0.0, 0.0, 0.0], [1.0, 0.0, 0.0]) - 90.0) < 1e-6


def test_calculate_angle_straight_line():
    assert abs(calculate_angle([0, 2, 0], [0, 1, 0], [0, 0, 0]) - 180.0) < 0.1


def test_landmarks_has_expected_indices():
    assert LANDMARKS["left_shoulder"] == 11
    assert LANDMARKS["nose"] == 0
    assert len(LANDMARKS) == 21
