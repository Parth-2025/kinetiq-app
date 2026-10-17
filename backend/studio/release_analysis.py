"""Pure body-angle summaries near uncertain, ball-supported release estimates."""
from __future__ import annotations

import math
from statistics import median, pstdev


_METRICS = ("elbow_flexion_near_release", "knee_flexion_near_release")


def _finite(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value))


def _empty(reason, *, total=0, excluded=0):
    return {"status": "unavailable", "minimum": None, "maximum": None,
            "midpoint_frame_value": None, "midpoint_frame_time_ms": None,
            "uncertainty_interval_ms": None, "usable_frames": 0,
            "excluded_frames": excluded, "total_overlapping_frames": total,
            "unit": "deg", "unavailable_reason": reason}


def summarize_releases(frames, reviewed_attempts):
    """Summarize pose angles over supported release uncertainty intervals.

    A per-attempt metric is emitted only when the full uncertainty interval is
    inside the corrected attempt interval and all overlapping pose evidence,
    including observations nearest each interval endpoint, is usable and
    temporally supported at <=100 ms spacing. The midpoint value is the nearest
    observed frame, never an interpolated or exact-release measurement.
    """
    frames = frames if isinstance(frames, list) else []
    attempts = reviewed_attempts if isinstance(reviewed_attempts, list) else []
    ordered = sorted((f for f in frames if isinstance(f, dict) and _finite(f.get("time_ms"))),
                     key=lambda f: f["time_ms"])
    output, eligible = [], {name: [] for name in _METRICS}

    for attempt in attempts:
        attempt = attempt if isinstance(attempt, dict) else {}
        candidate_id = attempt.get("candidate_id")
        bounds = attempt.get("interval_ms") if isinstance(attempt.get("interval_ms"), dict) else {}
        start, end = bounds.get("start_ms"), bounds.get("end_ms")
        rel = attempt.get("release") if isinstance(attempt.get("release"), dict) else {}
        lo, hi = rel.get("earliest_ms"), rel.get("latest_ms")
        valid_bounds = (_finite(start) and _finite(end) and start >= 0 and end > start and
                        rel.get("status") == "estimated" and _finite(lo) and _finite(hi) and
                        lo >= start and hi >= lo and hi <= end)
        reason = None if valid_bounds else "A supported estimated release interval fully contained by corrected attempt bounds is required."
        overlapping = [f for f in ordered if valid_bounds and lo <= f["time_ms"] <= hi and f["time_ms"] < end]
        within_attempt = [f for f in ordered if valid_bounds and start <= f["time_ms"] < end]
        endpoint_frames = []
        if within_attempt:
            endpoint_frames = [min(within_attempt, key=lambda f: abs(f["time_ms"] - t)) for t in (lo, hi)]
        selected = sorted({id(f): f for f in overlapping + endpoint_frames}.values(),
                          key=lambda f: f["time_ms"])
        endpoint_coverage = (bool(selected) and
            all(min(abs(f["time_ms"] - t) for f in within_attempt) <= 100 for t in (lo, hi))) if within_attempt else False
        timing_ok = (bool(selected) and endpoint_coverage and
                     all(b["time_ms"] > a["time_ms"] and b["time_ms"] - a["time_ms"] <= 100
                         for a, b in zip(selected, selected[1:])))
        if valid_bounds and not endpoint_coverage:
            reason = "No observed body frame lies within 100 ms of each release uncertainty endpoint."
        elif valid_bounds and not timing_ok:
            reason = "Body observations do not cover the release interval with strictly increasing gaps no greater than 100 ms."
        metrics = {}
        metric_ok = {}
        for name in _METRICS:
            source_name = name.removesuffix("_near_release")
            valid_frames = [f for f in selected if f.get("quality") == "usable" and
                            _finite(f.get(source_name)) and 0 <= f[source_name] <= 180]
            excluded = len(selected) - len(valid_frames)
            ok = valid_bounds and timing_ok and len(valid_frames) == len(selected) and bool(selected)
            metric_ok[name] = ok
            if not ok:
                metrics[name] = _empty(reason or "Every overlapping frame must have usable quality and a finite in-range angle.",
                                       total=len(selected), excluded=excluded)
                continue
            midpoint = (lo + hi) / 2
            mid_frame = min(valid_frames, key=lambda f: abs(f["time_ms"] - midpoint))
            metrics[name] = {"status": "available", "minimum": min(f[source_name] for f in valid_frames),
                "median_angle": median(f[source_name] for f in valid_frames),
                "maximum": max(f[source_name] for f in valid_frames),
                "midpoint_frame_value": mid_frame[source_name], "midpoint_frame_time_ms": mid_frame["time_ms"],
                "uncertainty_interval_ms": {"earliest_ms": lo, "latest_ms": hi,
                                             "midpoint_ms": midpoint},
                "usable_frames": len(valid_frames), "excluded_frames": excluded,
                "total_overlapping_frames": len(selected), "unit": "deg",
                "measurement_basis": "observed_body_angle_near_uncertain_release; not exact release angle",
                "unavailable_reason": None}
            eligible[name].append((candidate_id, metrics[name]["median_angle"]))
        output.append({"candidate_id": candidate_id, "status": "summarized" if any(metric_ok.values()) else "unavailable",
                       "interval_ms": {"start_ms": start if _finite(start) else None,
                                       "end_ms": end if _finite(end) else None},
                       "release_uncertainty_ms": {"earliest_ms": lo if _finite(lo) else None,
                                                  "latest_ms": hi if _finite(hi) else None},
                       "metrics": metrics})

    consistency = {}
    total = len(output)
    for name, values in eligible.items():
        ids = [candidate_id for candidate_id, _ in values]
        all_ids = [row["candidate_id"] for row in output]
        excluded_ids = [candidate_id for candidate_id in all_ids if candidate_id not in ids]
        samples = [value for _, value in values]
        excluded_count = total - len(samples)
        common = {"candidate_count": len(samples), "usable_candidate_count": len(samples),
                  "excluded_candidate_count": excluded_count, "total_candidate_count": total,
                  "candidate_ids_used": ids, "candidate_ids_excluded": excluded_ids,
                  "unit": "deg", "statistic": "median_angle_near_uncertain_release"}
        if len(samples) == 0:
            consistency[name] = {**common, "status": "unavailable", "median": None,
                                 "dispersion": None, "pairwise_absolute_difference": None,
                                 "unavailable_reason": "No attempts have supported body measurements near a fully covered release interval."}
        elif len(samples) == 1:
            consistency[name] = {**common, "status": "unavailable", "median": median(samples),
                                 "dispersion": None, "pairwise_absolute_difference": None,
                                 "unavailable_reason": "At least two supported attempts are required for a comparison."}
        elif len(samples) == 2:
            consistency[name] = {**common, "status": "preliminary", "median": median(samples),
                                 "dispersion": None,
                                 "pairwise_absolute_difference": abs(samples[0] - samples[1]),
                                 "unavailable_reason": None}
        else:
            consistency[name] = {**common, "status": "available", "median": median(samples),
                                 "dispersion": pstdev(samples),
                                 "dispersion_metric": "population_standard_deviation_of_per_attempt_median_angles",
                                 "pairwise_absolute_difference": None, "unavailable_reason": None}

    return {"attempts": output, "consistency": consistency,
            "limitations": ["Body angles summarize observed frames near an uncertain release interval, not an exact release instant.",
                "Release estimates and candidate attempts remain unconfirmed; body measurements do not establish shot intent or outcome.",
                "No ball speed or spin is reported."]}
