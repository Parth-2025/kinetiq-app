from analyzer.camera import classify_camera_view


def _m(width, height):
    return {"torso_width": width, "torso_height": height}


def test_side_view_low_ratio():
    view, conf = classify_camera_view([_m(0.05, 0.26)] * 10)
    assert view == "side"
    assert conf > 0.5


def test_front_view_high_ratio():
    view, conf = classify_camera_view([_m(0.26, 0.26)] * 10)
    assert view == "front"
    assert conf <= 0.4


def test_no_valid_metrics_returns_oblique_low_conf():
    view, conf = classify_camera_view([None, None])
    assert view == "oblique"
    assert conf == 0.2
