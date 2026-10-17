"""Conservative, evidence-backed capture and repetition diagnostics.

These heuristics describe what the pose stream supports. They do not detect a
ball release or judge shot outcome/technique.
"""
from __future__ import annotations

from statistics import median


def visibility_diagnostics(frames):
    """Summarize framing/visibility from original image-landmark evidence."""
    total = len(frames)
    usable = [f for f in frames if f.get("quality") == "usable"]
    per_frame = []
    for frame in frames:
        evidence = frame.get("image_evidence") or {}
        missing = list(evidence.get("missing_required", []))
        clipped = list(evidence.get("near_edge", []))
        per_frame.append({"time_ms": frame.get("time_ms"), "visible_required": len(evidence.get("visible_required", [])),
                          "missing_required": missing, "near_edge_required": clipped,
                          "status": "usable" if frame.get("quality") == "usable" else frame.get("quality", "unavailable")})
    usable_fraction = len(usable) / total if total else 0.0
    missing_counts = {}
    edge_counts = {}
    for row in per_frame:
        for joint in row["missing_required"]:
            missing_counts[joint] = missing_counts.get(joint, 0) + 1
        for joint in row["near_edge_required"]:
            edge_counts[joint] = edge_counts.get(joint, 0) + 1
    status = "good" if usable_fraction >= 0.75 else "limited" if usable_fraction >= 0.35 else "poor"
    return {"status": status, "usable_frame_fraction": round(usable_fraction, 3),
            "usable_frames": len(usable), "total_frames": total,
            "commonly_missing_required_joints": sorted(missing_counts, key=missing_counts.get, reverse=True)[:6],
            "commonly_near_edge_required_joints": sorted(edge_counts, key=edge_counts.get, reverse=True)[:6],
            "evidence": "MediaPipe image-landmark visibility and normalized image coordinates; heuristic thresholds",
            "frames": per_frame}


def _median_smooth(values, times, radius=1):
    out = []
    for i, value in enumerate(values):
        if value is None:
            out.append(None)
            continue
        left, right = i, i
        while left > max(0, i-radius) and values[left-1] is not None and 0 < times[left] - times[left-1] <= 250:
            left -= 1
        while right < min(len(values)-1, i+radius) and values[right+1] is not None and 0 < times[right+1] - times[right] <= 250:
            right += 1
        window = values[left:right+1]
        out.append(median(window) if window else None)
    return out


def segment_repetition_candidates(frames):
    """Find conservative elbow flexion-extension-return candidates.

    A candidate requires a visibly flexed start, extension excursion, and
    return to flexion. It is a motion candidate, not a confirmed basketball
    attempt. Candidates require contiguous usable observations at no more than
    250 ms between samples. Gaps are never interpolated.
    """
    raw = [f.get("elbow_flexion") if f.get("quality") == "usable" else None for f in frames]
    smooth = _median_smooth(raw, [f["time_ms"] for f in frames])
    # Seek local flexion maxima, then the intervening extension minimum, then
    # a later flexion maximum. Each candidate consumes its complete interval.
    maxima = [i for i in range(1, len(raw)-1) if raw[i] is not None and raw[i-1] is not None
              and raw[i+1] is not None and raw[i] >= raw[i-1] and raw[i] > raw[i+1]]
    candidates = []
    cursor = 0
    for start_idx in maxima:
        if start_idx < cursor:
            continue
        later = [i for i in maxima if i > start_idx]
        if not later:
            break
        # Pair the next flexion peak after a substantial extension valley.
        end_idx = None
        valley_idx = None
        for candidate_end in later:
            # Missing observations or time gaps break the entire candidate interval.
            if any(raw[i] is None for i in range(start_idx, candidate_end+1)):
                break
            if any(not 0 < frames[i]["time_ms"] - frames[i-1]["time_ms"] <= 250
                   for i in range(start_idx+1, candidate_end+1)):
                break
            section = [(i, smooth[i]) for i in range(start_idx+1, candidate_end) if smooth[i] is not None]
            if not section:
                continue
            low_i, low_v = min(section, key=lambda x: x[1])
            excursion = min(smooth[start_idx], smooth[candidate_end]) - low_v
            duration = frames[candidate_end]["time_ms"] - frames[start_idx]["time_ms"]
            if excursion >= 22 and 350 <= duration <= 10000:
                end_idx, valley_idx = candidate_end, low_i
                break
        if end_idx is None:
            continue
        segment = frames[start_idx:end_idx+1]
        valid = [f for f in segment if f.get("quality") == "usable" and f.get("elbow_flexion") is not None]
        coverage = len(valid) / len(segment) if segment else 0
        if coverage < 0.7:
            continue
        start_t, valley_t, end_t = (frames[i]["time_ms"] for i in (start_idx, valley_idx, end_idx))
        candidates.append({"start_ms": start_t, "end_ms": end_t,
            "segment_coverage": {"valid_elbow_samples": len(valid), "total_samples": len(segment), "fraction": round(coverage, 3)},
            "evidence_quality": "heuristic_contiguous_pose_pattern",
            "evidence_provenance": "heuristic elbow-angle excursion with valid-sample coverage; no ball tracking or release evidence",
            "phase_timing": {"extension_minimum_ms": valley_t, "status": "estimated_from_elbow_flexion_minimum",
                             "release_ms": None, "release_unavailable_reason": "No ball tracking or release evidence is available."}})
        cursor = end_idx
    return {"candidates": candidates,
            "status": "candidates_found" if candidates else "unavailable",
            "unavailable_reason": None if candidates else "No complete flexion-extension-return pattern met the conservative duration, excursion, and coverage criteria.",
            "method": "median-smoothed dominant elbow flexion; >=22 degree excursion; 350 ms to 10 s interval; contiguous usable samples with <=250 ms between observations",
            "limitations": ["Candidate intervals do not establish that a basketball shot occurred.", "Ball release and outcome are not inferred."]}
