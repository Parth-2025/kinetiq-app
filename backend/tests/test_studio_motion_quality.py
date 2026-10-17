from studio.motion_quality import segment_repetition_candidates, visibility_diagnostics


def frames_for(angles, *, unusable=()):
    return [{"time_ms": i * 100, "quality": "usable" if i not in unusable else "partial_body_or_occlusion",
             "elbow_flexion": angle if i not in unusable else None,
             "image_evidence": {"visible_required": ["head", "wrist"] if i not in unusable else ["head"],
                                "missing_required": [] if i not in unusable else ["wrist"],
                                "near_edge": ["wrist"] if i == 0 else []}}
            for i, angle in enumerate(angles)]


def test_segments_complete_flexion_extension_return_and_reports_evidence():
    # Two clean flexion (large angle) -> extension (small angle) -> flexion cycles.
    result = segment_repetition_candidates(frames_for(
        [120, 140, 160, 140, 110, 80, 55, 70, 100, 130, 120, 120,
         140, 160, 140, 110, 80, 55, 70, 100, 130, 120]))
    assert result["status"] == "candidates_found"
    assert len(result["candidates"]) == 2
    candidate = result["candidates"][0]
    assert candidate["segment_coverage"]["fraction"] == 1
    assert candidate["evidence_provenance"]
    assert candidate["evidence_quality"] == "heuristic_contiguous_pose_pattern"
    assert "confidence" not in candidate
    assert candidate["phase_timing"]["release_ms"] is None
    assert "No ball tracking" in candidate["phase_timing"]["release_unavailable_reason"]


def test_incomplete_or_low_coverage_motion_is_not_promoted_to_candidate():
    incomplete = segment_repetition_candidates(frames_for([120, 145, 155, 120, 80, 55, 75]))
    assert incomplete["status"] == "unavailable"
    assert incomplete["candidates"] == []

    angles = [120, 140, 160, 140, 110, 80, 55, 70, 100, 130, 155]
    sparse = segment_repetition_candidates(frames_for(angles, unusable=range(3, 8)))
    assert sparse["status"] == "unavailable"
    assert sparse["candidates"] == []


def test_visibility_summary_exposes_framing_evidence():
    frames = frames_for([120, 130, 140, 150], unusable=(1, 2, 3))
    result = visibility_diagnostics(frames)
    assert result["status"] == "poor"
    assert result["usable_frames"] == 1
    assert result["commonly_missing_required_joints"] == ["wrist"]
    assert result["commonly_near_edge_required_joints"] == ["wrist"]


def test_high_coverage_occlusion_cannot_bridge_a_candidate():
    angles = [120, 140, 160, 140, 110, 80, 55, 70, 100, 130, 155, 130]
    assert segment_repetition_candidates(frames_for(angles, unusable=(5,)))["candidates"] == []


def test_timestamp_gap_cannot_bridge_a_candidate():
    frames = frames_for([120, 140, 160, 140, 110, 80, 55, 70, 100, 130, 155, 130])
    for frame in frames[5:]:
        frame["time_ms"] += 2000
    assert segment_repetition_candidates(frames)["candidates"] == []


def test_edge_cropped_landmark_is_missing_with_explicit_edge_reason():
    from types import SimpleNamespace
    from studio.analysis import image_landmark_evidence
    points = [SimpleNamespace(x=0.5, y=0.5, visibility=1.0) for _ in range(33)]
    for coordinate in (0.0, 0.005, 0.995, 1.0):
        points[15].x = coordinate
        evidence = image_landmark_evidence(points)
        assert "left_wrist" in evidence["missing_required"]
        assert "left_wrist" in evidence["near_edge"]
        assert "left_wrist" not in evidence["visible_required"]
    points[15].x = 0.02
    evidence = image_landmark_evidence(points)
    assert "left_wrist" in evidence["visible_required"]
    assert "left_wrist" in evidence["near_edge"]


def test_smoothing_does_not_use_samples_across_missing_or_timestamp_gaps():
    from studio.motion_quality import _median_smooth
    assert _median_smooth([10, None, 150], [0, 100, 200], radius=2) == [10, None, 150]
    assert _median_smooth([10, 150], [0, 2000]) == [10, 150]
