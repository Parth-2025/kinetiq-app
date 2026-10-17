"""Pure, conservative summaries for pose-derived shot motion candidates.

These records describe candidate body motion only. They do not confirm shots;
ball tracking and release evidence are unavailable in this analyzer.
"""
from __future__ import annotations

import math
from statistics import pstdev


_METRICS = ("elbow_flexion", "knee_flexion")


def _finite_number(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value))


def summarize_shot_candidates(frames, candidates):
    """Return per-candidate measurement coverage and candidate-level dispersion.

    Bounds are half-open milliseconds [start_ms, end_ms). Invalid or overlapping candidate
    intervals are retained in output but excluded from measurements. Frames
    are never pooled across candidates.
    """
    rows = []
    for index, candidate in enumerate(candidates):
        candidate = candidate if isinstance(candidate, dict) else {}
        start, end = candidate.get("start_ms"), candidate.get("end_ms")
        valid = (_finite_number(start) and _finite_number(end) and start >= 0 and end > start)
        rows.append({"candidate_index": index, "start_ms": start if _finite_number(start) else None,
                     "end_ms": end if _finite_number(end) else None,
                     "_valid": valid, "_overlap": False})

    # Any positive-duration overlap makes both intervals ambiguous.
    for i, left in enumerate(rows):
        if not left["_valid"]:
            continue
        for right in rows[i + 1:]:
            if right["_valid"] and max(left["start_ms"], right["start_ms"]) < min(left["end_ms"], right["end_ms"]):
                left["_overlap"] = right["_overlap"] = True

    output = []
    eligible_metrics = {name: [] for name in _METRICS}
    for row in rows:
        start, end = row["start_ms"], row["end_ms"]
        if not row["_valid"]:
            output.append({"candidate_index": row["candidate_index"], "status": "invalid_bounds",
                "start_ms": start, "end_ms": end, "shot_status": "unconfirmed_candidate",
                "reason": "Candidate bounds must be finite nonnegative times with end_ms greater than start_ms.",
                "usable_body_samples": 0, "total_samples": 0, "body_coverage": None,
                "metrics": {name: _empty_metric() for name in _METRICS}})
            continue
        if row["_overlap"]:
            output.append({"candidate_index": row["candidate_index"], "status": "overlapping_bounds",
                "start_ms": start, "end_ms": end, "shot_status": "unconfirmed_candidate",
                "reason": "Candidate intervals overlap, so their per-candidate attribution is ambiguous.",
                "usable_body_samples": 0, "total_samples": 0, "body_coverage": None,
                "metrics": {name: _empty_metric() for name in _METRICS}})
            continue

        segment = [f for f in frames if isinstance(f, dict) and _finite_number(f.get("time_ms"))
                   and start <= f["time_ms"] < end]
        total = len(segment)
        times = [f["time_ms"] for f in segment]
        timing_ok = (all(b > a for a, b in zip(times, times[1:])) and
                     all(b - a <= 250 for a, b in zip(times, times[1:])) and
                     bool(times) and times[0] - start <= 250 and end - times[-1] <= 250)
        usable = [f for f in segment if f.get("quality") == "usable"]
        metrics = {}
        for name in _METRICS:
            values = [f.get(name) for f in usable if _finite_number(f.get(name)) and 0 <= f[name] <= 180]
            coverage = len(values) / total if total else 0.0
            enough = len(values) >= 5 and coverage >= 0.70 and timing_ok
            metric = {"minimum": min(values) if enough else None,
                      "maximum": max(values) if enough else None,
                      "excursion": max(values) - min(values) if enough else None,
                      "valid_samples": len(values), "total_samples": total,
                      "coverage": round(coverage, 3), "unit": "deg",
                      "status": "available" if enough else "unavailable",
                      "unavailable_reason": None if enough else
                        ("Candidate timestamps are duplicate, nonmonotonic, or separated by more than 250 ms." if not timing_ok else
                         "Fewer than five finite measurements within the 0–180 degree range in this candidate." if len(values) < 5 else
                         "Finite in-range measurements cover less than 70% of candidate samples.")}
            metrics[name] = metric
            if enough:
                eligible_metrics[name].append((row["candidate_index"], metric))
        output.append({"candidate_index": row["candidate_index"], "status": "summarized",
            "start_ms": start, "end_ms": end, "shot_status": "unconfirmed_candidate",
            "reason": "Pose motion candidate only; no ball evidence confirms a shot.",
            "usable_body_samples": len(usable), "total_samples": total,
            "body_coverage": round(len(usable) / total, 3) if total else 0.0,
            "metrics": metrics})

    consistency = {}
    for name, values in eligible_metrics.items():
        used_ids = [candidate_id for candidate_id, _ in values]
        if len(values) == 2:
            consistency[name] = {"status": "preliminary", "candidate_count": 2,
                "total_candidate_count": len(output), "excluded_candidate_count": len(output) - 2,
                "candidate_ids_used": used_ids, "dispersion": None,
                "pairwise_absolute_difference": {field: abs(values[0][1][field] - values[1][1][field])
                    for field in ("minimum", "maximum", "excursion")},
                "unit": "deg", "confidence": "heuristic", "unavailable_reason": None,
                "note": "Two candidates support only a preliminary pair comparison; more attempts are needed to assess repeatability."}
        elif len(values) < 3:
            consistency[name] = {"status": "unavailable", "candidate_count": len(values),
                "total_candidate_count": len(output), "excluded_candidate_count": len(output) - len(values),
                "candidate_ids_used": used_ids,
                "required_candidates": 3, "dispersion": None, "unit": "deg",
                "confidence": "heuristic", "unavailable_reason": "At least three candidates need five finite in-range measurements, 70% coverage, and valid sampling intervals for this metric."}
        else:
            excursions = [metric["excursion"] for _, metric in values]
            consistency[name] = {"status": "available", "candidate_count": len(values),
                "total_candidate_count": len(output), "excluded_candidate_count": len(output) - len(values),
                "candidate_ids_used": used_ids,
                "dispersion": round(pstdev(excursions), 3), "dispersion_metric": "population_standard_deviation_of_candidate_excursions",
                "candidate_excursions": excursions,
                "dispersion_by_measurement": {field: round(pstdev([metric[field] for _, metric in values]), 3)
                    for field in ("minimum", "maximum", "excursion")},
                "unit": "deg", "confidence": "heuristic", "unavailable_reason": None}

    unavailable = {name: {"value": None, "unit": unit, "status": "unavailable", "reason": reason}
        for name, unit, reason in (
            ("release_timing_ms", "ms", "Ball tracking and release evidence are unavailable."),
            ("release_speed", "m/s", "Ball tracking and calibrated 3D ball motion are unavailable."),
            ("arc", "deg", "Ball trajectory tracking is unavailable."),
            ("spin", "rev/s", "Ball rotation tracking is unavailable."))}
    return {"schema_version": "shot_candidate_summary.v1", "status": "experimental_pose_candidates",
        "total_candidate_count": len(output), "confirmed_shot_count": None,
        "shot_confirmation": "unavailable_without_ball_evidence", "candidates": output,
        "cross_candidate_consistency": consistency, "unavailable_measurements": unavailable,
        "limitations": ["Candidates are heuristic body-motion intervals and are not confirmed shots.",
            "Candidate measurements are summarized independently; frames are never pooled across candidates."]}


def _empty_metric():
    return {"minimum": None, "maximum": None, "excursion": None, "valid_samples": 0,
            "total_samples": 0, "coverage": 0.0, "unit": "deg", "status": "unavailable",
            "unavailable_reason": "Candidate bounds are invalid or overlap another candidate."}
