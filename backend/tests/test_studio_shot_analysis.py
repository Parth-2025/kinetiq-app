import math

from studio.shot_analysis import summarize_shot_candidates


def make_frames(start, count, elbow_base=20, knee_base=30, omit_elbow=()):
    return [{"time_ms": start + i * 50, "quality": "usable",
             "elbow_flexion": None if i in omit_elbow else elbow_base + i,
             "knee_flexion": knee_base + i * 2} for i in range(count)]


def test_reports_separate_candidate_metrics_and_dispersion():
    frames = make_frames(0, 8) + make_frames(1000, 8, 40, 25) + make_frames(2000, 8, 60, 15)
    candidates = [{"start_ms": start, "end_ms": start + 400} for start in (0, 1000, 2000)]
    result = summarize_shot_candidates(frames, candidates)

    assert [c["shot_status"] for c in result["candidates"]] == ["unconfirmed_candidate"] * 3
    assert [c["metrics"]["elbow_flexion"]["minimum"] for c in result["candidates"]] == [20, 40, 60]
    consistency = result["cross_candidate_consistency"]["elbow_flexion"]
    assert consistency["candidate_count"] == 3
    assert consistency["candidate_excursions"] == [7, 7, 7]
    assert consistency["dispersion"] == 0
    assert consistency["dispersion_by_measurement"]["minimum"] > 0
    assert consistency["dispersion_by_measurement"]["maximum"] > 0
    assert consistency["dispersion_by_measurement"]["excursion"] == 0
    assert consistency["candidate_ids_used"] == [0, 1, 2]
    assert consistency["excluded_candidate_count"] == 0
    assert result["unavailable_measurements"]["release_timing_ms"]["value"] is None
    assert result["unavailable_measurements"]["spin"]["value"] is None


def test_metric_requires_five_finite_samples_and_seventy_percent_coverage():
    frames = make_frames(0, 8, omit_elbow=(0, 1, 2))
    result = summarize_shot_candidates(frames, [{"start_ms": 0, "end_ms": 400}])
    elbow = result["candidates"][0]["metrics"]["elbow_flexion"]
    assert elbow["valid_samples"] == 5
    assert elbow["coverage"] == 0.625
    assert elbow["status"] == "unavailable"
    assert elbow["minimum"] is None


def test_two_eligible_candidates_get_preliminary_pair_comparison():
    frames = make_frames(0, 6) + make_frames(1000, 4) + make_frames(2000, 6)
    candidates = [{"start_ms": 0, "end_ms": 250}, {"start_ms": 1000, "end_ms": 1150},
                  {"start_ms": 2000, "end_ms": 2250}]
    consistency = summarize_shot_candidates(frames, candidates)["cross_candidate_consistency"]["elbow_flexion"]
    assert consistency["status"] == "preliminary"
    assert consistency["candidate_count"] == 2
    assert consistency["dispersion"] is None
    assert consistency["pairwise_absolute_difference"]["excursion"] == 0
    assert consistency["excluded_candidate_count"] == 1


def test_invalid_and_overlapping_bounds_are_excluded_defensively():
    frames = make_frames(0, 20)
    candidates = [{"start_ms": 0, "end_ms": 500}, {"start_ms": 400, "end_ms": 700},
                  {"start_ms": 900, "end_ms": 900}, {"start_ms": math.nan, "end_ms": 1200}]
    rows = summarize_shot_candidates(frames, candidates)["candidates"]
    assert [row["status"] for row in rows] == ["overlapping_bounds", "overlapping_bounds",
                                               "invalid_bounds", "invalid_bounds"]
    assert all(row["metrics"]["elbow_flexion"]["minimum"] is None for row in rows)


def test_nonfinite_measurements_do_not_count():
    frames = make_frames(0, 6)
    frames[0]["elbow_flexion"] = math.inf
    result = summarize_shot_candidates(frames, [{"start_ms": 0, "end_ms": 300}])
    metric = result["candidates"][0]["metrics"]["elbow_flexion"]
    assert metric["valid_samples"] == 5
    assert metric["status"] == "available"
    assert metric["minimum"] == 21


def test_half_open_bounds_do_not_double_count_adjacent_boundary_frame():
    frames = make_frames(0, 11, elbow_base=20)
    result = summarize_shot_candidates(frames, [{"start_ms": 0, "end_ms": 250},
                                                {"start_ms": 250, "end_ms": 500}])
    first, second = result["candidates"]
    assert first["total_samples"] == 5
    assert second["total_samples"] == 5
    assert first["metrics"]["elbow_flexion"]["maximum"] == 24
    assert second["metrics"]["elbow_flexion"]["minimum"] == 25


def test_duplicate_times_long_gaps_and_out_of_range_angles_are_rejected():
    duplicate = make_frames(0, 6)
    duplicate[2]["time_ms"] = duplicate[1]["time_ms"]
    gap = make_frames(1000, 6)
    gap[3]["time_ms"] = 1300
    out_of_range = make_frames(2000, 6)
    out_of_range[0]["elbow_flexion"] = 181
    candidates = [{"start_ms": 0, "end_ms": 300}, {"start_ms": 1000, "end_ms": 1500},
                  {"start_ms": 2000, "end_ms": 2300}]
    result = summarize_shot_candidates(duplicate + gap + out_of_range, candidates)
    rows = result["candidates"]
    assert rows[0]["metrics"]["elbow_flexion"]["status"] == "unavailable"
    assert "timestamps" in rows[0]["metrics"]["elbow_flexion"]["unavailable_reason"]
    assert rows[1]["metrics"]["knee_flexion"]["status"] == "unavailable"
    assert "timestamps" in rows[1]["metrics"]["knee_flexion"]["unavailable_reason"]
    assert rows[2]["metrics"]["elbow_flexion"]["valid_samples"] == 5
    assert rows[2]["metrics"]["elbow_flexion"]["minimum"] == 21


def test_invalid_bound_values_are_json_safe_and_spin_unit_is_rev_per_second():
    result = summarize_shot_candidates([], [{"start_ms": math.inf, "end_ms": math.nan}])
    row = result["candidates"][0]
    assert row["start_ms"] is None and row["end_ms"] is None
    assert result["unavailable_measurements"]["spin"]["unit"] == "rev/s"
