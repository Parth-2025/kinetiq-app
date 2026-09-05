from analyzer.scoring_curve import score_metric


def test_inside_band_is_100():
    assert score_metric(95.0, 85.0, 100.0, 30.0) == 100.0
    assert score_metric(85.0, 85.0, 100.0, 30.0) == 100.0
    assert score_metric(100.0, 85.0, 100.0, 30.0) == 100.0


def test_linear_falloff():
    assert score_metric(115.0, 85.0, 100.0, 30.0) == 50.0
    assert score_metric(70.0, 85.0, 100.0, 30.0) == 50.0
    assert score_metric(55.0, 85.0, 100.0, 30.0) == 0.0
    assert score_metric(40.0, 85.0, 100.0, 30.0) == 0.0


def test_tilt_falloff_is_tight():
    assert score_metric(0.08, 0.0, 0.04, 0.08) == 50.0
