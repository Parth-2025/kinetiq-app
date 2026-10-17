import math

import pytest

from studio.ball_tracking import analyze_ball_observations


def sample(t, y=.5, *, x=.5, wrist=None, shoulder=None, people=1, detections=True, index=None):
    return {"time_ms": t, "frame_index": t // 33 if index is None else index,
            "width_px": 1280, "height_px": 720,
            "detections": ([{"bbox": [x-.01, y-.01, x+.01, y+.01], "score": .9}] if detections else []),
            "wrist": wrist, "shoulder": shoulder, "person_count": people,
            "pose_time_ms": t if wrist is not None else None}


def test_two_observed_supported_releases():
    rows = []
    for base in (0, 600):
        rows += [sample(base, .25, wrist=[.5, .25], shoulder=[.5, .4]),
                 sample(base+33, .19, wrist=[.5, .25], shoulder=[.5, .4]),
                 sample(base+66, .13), sample(base+99, .07)]
    result = analyze_ball_observations(rows)
    assert len(result["attempts"]) == 2
    assert all(a["status"] == "ball_supported_candidate" for a in result["attempts"])
    assert result["attempts"][0]["release"]["earliest_ms"] == 33
    assert "interpolated" in result["limitations"][1]


def test_gaps_and_missed_observations_do_not_interpolate_release():
    rows = [sample(0, .5, wrist=[.5, .5], shoulder=[.5, .3]),
            sample(33, .4, detections=False), sample(66, .3), sample(100, .2)]
    result = analyze_ball_observations(rows)
    assert result["attempts"] == []
    assert result["tracks"][0]["missing_spans"] == 0


def test_multiple_people_and_ambiguous_ball_matches_stop_association():
    rows = [sample(0, .5),
            {**sample(33, .5, people=2), "detections": [
                {"bbox": [.49,.49,.51,.51], "score": .8},
                {"bbox": [.50,.49,.52,.51], "score": .7}]}]
    result = analyze_ball_observations(rows)
    assert result["quality"]["ambiguous_frames"] == 1
    assert result["quality"]["unassociated_detections"] == 2
    assert result["quality"]["multiple_person_frames"] == 1
    assert result["attempts"] == []


def test_no_ball_and_invalid_detection_are_distinct():
    no_ball = analyze_ball_observations([sample(0, detections=False)])
    invalid = analyze_ball_observations([{**sample(0), "detections": [{"bbox": [math.nan, 0, 1, 1]}]}])
    assert no_ball["status"] == "no_detections"
    assert invalid["status"] == "no_detections"
    assert no_ball["quality"]["invalid_detections"] == 0
    assert invalid["quality"]["invalid_detections"] == 1


@pytest.mark.parametrize("times", [[1, 1], [2, 1], [float("inf")]])
def test_bad_timing_is_rejected(times):
    rows = [sample(t) for t in times]
    with pytest.raises(ValueError):
        analyze_ball_observations(rows)


def test_frame_limit():
    with pytest.raises(ValueError):
        analyze_ball_observations([sample(i) for i in range(1802)])
