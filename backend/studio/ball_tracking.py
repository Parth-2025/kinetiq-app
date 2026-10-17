"""Conservative observed-only ball tracklets and ball-supported release candidates.

Image coordinates are normalized. This module does not call a detector or infer
physical ball motion, shot intent, or confirmed shots.
"""
from __future__ import annotations

import math


def _finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _point(value):
    return (isinstance(value, (list, tuple)) and len(value) == 2 and
            all(_finite_number(v) and 0 <= v <= 1 for v in value))


def _center(box):
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def analyze_ball_observations(observations: list) -> dict:
    """Analyze ordered, sampled detector observations without interpolation.

    Invalid individual rows/detections are skipped and counted. Non-finite or
    non-increasing timestamps invalidate the complete input to avoid inventing
    chronology. Frames are limited to 1801.
    """
    if not isinstance(observations, list) or len(observations) > 1801:
        raise ValueError("observations must be a list of at most 1801 samples")
    previous_index, dimensions = -1, None
    for row in observations:
        t = row.get("time_ms") if isinstance(row, dict) else None
        if not _finite_number(t) or t < 0:
            raise ValueError("time_ms must be finite and nonnegative")
        if not isinstance(row, dict):
            continue
        index, w, h = row.get("frame_index"), row.get("width_px"), row.get("height_px")
        if (not isinstance(index, int) or isinstance(index, bool) or index < 0 or index <= previous_index):
            raise ValueError("frame_index values must be strictly increasing nonnegative integers")
        previous_index = index
        if (not isinstance(w, int) or isinstance(w, bool) or
                not isinstance(h, int) or isinstance(h, bool) or w <= 0 or h <= 0):
            raise ValueError("frame dimensions must be positive integers")
        if dimensions is None:
            dimensions = (w, h)
        elif dimensions != (w, h):
            raise ValueError("frame dimensions must remain constant")
    times = [r["time_ms"] for r in observations]
    if any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError("observations must have strictly increasing time_ms")

    tracks, active, next_id = [], {}, 1
    quality = {"input_frames": len(observations), "valid_frames": 0,
               "invalid_frames": 0, "valid_detections": 0,
               "invalid_detections": 0, "ambiguous_frames": 0,
               "unassociated_detections": 0, "multiple_person_frames": 0,
               "invalid_person_counts": 0}
    frame_evidence = []
    for frame_no, row in enumerate(observations):
        index, w, h = row.get("frame_index"), row.get("width_px"), row.get("height_px")
        if (not isinstance(index, int) or isinstance(index, bool) or index < 0 or
                not isinstance(w, int) or not isinstance(h, int) or w <= 0 or h <= 0):
            quality["invalid_frames"] += 1
            continue
        quality["valid_frames"] += 1
        person_count = row.get("person_count")
        valid_person_count = isinstance(person_count, int) and not isinstance(person_count, bool) and person_count >= 0
        if not valid_person_count:
            quality["invalid_person_counts"] += 1
        if valid_person_count and person_count > 1:
            quality["multiple_person_frames"] += 1
        valid = []
        for d in row.get("detections", []) if isinstance(row.get("detections", []), list) else []:
            box, score = (d.get("bbox"), d.get("score")) if isinstance(d, dict) else (None, None)
            if (isinstance(box, (list, tuple)) and len(box) == 4 and
                all(_finite_number(v) for v in box) and
                0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1 and
                (score is None or (_finite_number(score) and 0 <= score <= 1))):
                valid.append({"bbox": list(box), "score": score})
                quality["valid_detections"] += 1
            else:
                quality["invalid_detections"] += 1

        active = {tid: tr for tid, tr in active.items()
                  if row["time_ms"] - tr["points"][-1]["time_ms"] <= 150}
        candidates = [(tid, tr["points"][-1]) for tid, tr in active.items()
                      if row["time_ms"] - tr["points"][-1]["time_ms"] <= 150]
        costs = [[_dist(_center(p["bbox"]), _center(d["bbox"])) for d in valid]
                 for _, p in candidates]
        assignments, ambiguous = {}, False
        if len(candidates) == 1 and len(valid) == 1:
            if costs[0][0] <= .16:
                assignments[0] = candidates[0][0]
        elif len(candidates) == 1 and len(valid) > 1:
            ranked = sorted((v, i) for i, v in enumerate(costs[0]))
            if ranked[0][0] <= .16 and ranked[1][0] - ranked[0][0] >= .035:
                assignments[ranked[0][1]] = candidates[0][0]
            elif ranked[0][0] <= .16:
                ambiguous = True
        elif len(candidates) > 1 and len(valid) > 0:
            # Only associate when a single global pair is clearly better. Do not
            # guess at crossings or partial multi-object assignment.
            pairs = sorted((costs[i][j], i, j) for i in range(len(candidates))
                           for j in range(len(valid)) if costs[i][j] <= .16)
            if pairs:
                best = pairs[0]
                if len(pairs) == 1 or pairs[1][0] - best[0] >= .035:
                    assignments[best[2]] = candidates[best[1]][0]
                else:
                    ambiguous = True
        if ambiguous:
            quality["ambiguous_frames"] += 1
            # A contested observation invalidates continuity for every active
            # identity. Later detections begin new tracklets.
            active.clear()
        frame_points = []
        for di, det in enumerate(valid):
            tid = assignments.get(di)
            if tid is None and not ambiguous:
                tid = f"ball-{next_id}"; next_id += 1
                tracks.append({"track_id": tid, "points": []})
            if tid is None:
                quality["unassociated_detections"] += 1
                frame_points.append({"track_id": None, "association": "ambiguous", **det})
                continue
            point = {"time_ms": row["time_ms"], "frame_index": index,
                     "observation_index": frame_no,
                     "center": list(_center(det["bbox"])), "bbox": det["bbox"], "score": det["score"]}
            tr = next(t for t in tracks if t["track_id"] == tid)
            tr["points"].append(point)
            active[tid] = tr
            frame_points.append({"track_id": tid, "association": "matched" if di in assignments else "initialized", **det})
        frame_evidence.append({"time_ms": row["time_ms"], "frame_index": index,
                               "detections": frame_points})

    observation_by_time = {r["time_ms"]: r for r in observations if isinstance(r, dict)}
    attempts = []
    for tr in tracks:
        pts = tr["points"]
        missing = [{"after_frame_index": a["frame_index"], "before_frame_index": b["frame_index"],
                    "missing_samples": b["observation_index"] - a["observation_index"] - 1}
                   for a, b in zip(pts, pts[1:])
                   if b["observation_index"] - a["observation_index"] > 1]
        tr["missing_observation_gaps"] = missing
        tr["missing_spans"] = len(missing)
        tr["gap_count"] = sum(1 for a, b in zip(pts, pts[1:]) if b["time_ms"] - a["time_ms"] > 50)
        armed = None
        armed_wrist = armed_shoulder = None
        last_attempt = -10**12
        for i, p in enumerate(pts):
            source = observation_by_time.get(p["time_ms"], {})
            wrist, shoulder = source.get("wrist"), source.get("shoulder")
            fresh = (_finite_number(source.get("pose_time_ms")) and
                     0 <= p["time_ms"] - source["pose_time_ms"] <= 100)
            single_person_fresh = (type(source.get("person_count")) is int and source.get("person_count") == 1 and fresh and
                                   len(source.get("detections", [])) == 1)
            supported = (single_person_fresh and _point(wrist) and _point(shoulder)
                         and _dist(p["center"], wrist) <= .09 and wrist[1] < shoulder[1])
            if supported:
                armed = i
                armed_wrist, armed_shoulder = list(wrist), list(shoulder)
                continue
            if armed is None or p["time_ms"] - pts[armed]["time_ms"] > 150:
                if not single_person_fresh:
                    armed = None
                    armed_wrist = armed_shoulder = None
                continue
            # Release requires >=3 observed samples from near-hand through
            # separation, monotonically upward, and an overhead hand anchor.
            segment = pts[armed:i + 1]
            contiguous = all(b["observation_index"] == a["observation_index"] + 1
                             for a, b in zip(segment, segment[1:]))
            segment_supported = all(
                type(observation_by_time.get(q["time_ms"], {}).get("person_count")) is int and
                observation_by_time.get(q["time_ms"], {}).get("person_count") == 1 and
                len(observation_by_time.get(q["time_ms"], {}).get("detections", [])) == 1 and
                _finite_number(observation_by_time.get(q["time_ms"], {}).get("pose_time_ms")) and
                0 <= q["time_ms"] - observation_by_time[q["time_ms"]]["pose_time_ms"] <= 100
                for q in segment)
            if not contiguous or not segment_supported:
                armed = None
                armed_wrist = armed_shoulder = None
                continue
            if len(segment) < 3:
                continue
            prior = pts[armed]
            upward = all(b["center"][1] < a["center"][1] for a, b in zip(segment, segment[1:]))
            separated = _dist(p["center"], armed_wrist) >= .14
            supported_geometry = armed_wrist[1] < armed_shoulder[1] - .05
            if upward and separated and supported_geometry and p["time_ms"] - last_attempt >= 500:
                t0, t1 = prior["time_ms"], p["time_ms"]
                attempts.append({"id": f"attempt-{len(attempts)+1}", "track_id": tr["track_id"],
                    "start_ms": t0, "end_ms": t1,
                    "release": {"status": "estimated", "time_ms": t0, "earliest_ms": t0,
                                "latest_ms": t1, "method": "observed_ball_wrist_separation"},
                    "status": "ball_supported_candidate",
                    "evidence": {"observed_frame_indices": [q["frame_index"] for q in segment],
                                 "observed_samples": len(segment), "single_person": True,
                                 "fresh_pose": True, "every_sample_single_person_and_fresh_pose": True,
                                 "single_ball_each_sample": True,
                                 "upward_continuous": True,
                                 "overhead_hand": True, "basket_or_intent_evidence": False}})
                last_attempt = p["time_ms"]
                armed = None
            elif p["time_ms"] - pts[armed]["time_ms"] > 150:
                armed = None
                armed_wrist = armed_shoulder = None
    for tr in tracks:
        tr["association"] = "observed_only"
    return {"schema_version": "ball_tracks.v1",
            "status": "experimental" if quality["valid_detections"] else "no_detections",
            "tracks": tracks, "attempts": attempts, "quality": quality,
            "config": {"max_gap_ms": 150, "center_motion_gate_normalized": .16,
                       "pipeline_version": "ball-tracking-experimental-1",
                       "near_wrist_gate_normalized": .09, "release_separation_normalized": .14,
                       "overhead_margin_normalized": .05, "minimum_release_samples": 3,
                       "release_cooldown_ms": 500, "max_release_window_ms": 150,
                       "require_single_ball_and_person": True,
                       "ambiguity_margin_normalized": .035, "fresh_pose_ms": 100,
                       "association_mode": "observed_only"},
            "evidence": {"frames": frame_evidence, "source_frame_references_retained": True},
            "limitations": ["Detector class is not verified as basketball.",
                "Observed samples only; gaps are not interpolated and track identity is uncertain.",
                "Overhead passes can resemble shots; candidates are never confirmed shots and need human review.",
                "Speed (m/s), physical arc, and spin are unavailable: no camera calibration, court scale, or rotation evidence."]}
