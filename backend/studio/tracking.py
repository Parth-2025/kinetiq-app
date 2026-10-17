"""Experimental single-camera 2D person tracking primitives.

Tracks are anonymous and image-relative. This module deliberately does not
infer identity, court coordinates, player metrics, or scrimmage events.
"""
from __future__ import annotations

import math


def _center(box):
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _distance(a, b):
    ax, ay = _center(a)
    bx, by = _center(b)
    return math.hypot(ax - bx, ay - by)


def associate_detections(frames, *, max_gap_frames=4, gate=0.22, ambiguity_margin=0.035):
    """Assign <=2 normalized person boxes to anonymous tracks.

    Input rows: ``{"time_ms": int, "detections": [{"bbox": [x1,y1,x2,y2],
    "full_body": bool, "landmark_quality": float}]}``. When competing
    assignments are close, association is withheld and the frame is marked
    ambiguous. No interpolation is performed.
    """
    if not isinstance(max_gap_frames, int) or max_gap_frames < 1:
        raise ValueError("max_gap_frames must be a positive integer")
    if not math.isfinite(gate) or gate <= 0 or gate > 1:
        raise ValueError("gate must be finite and between 0 and 1")
    if not math.isfinite(ambiguity_margin) or ambiguity_margin < 0 or ambiguity_margin > gate:
        raise ValueError("ambiguity_margin must be finite and between 0 and gate")
    tracks, active, output = [], {}, []
    previous_time, previous_index = -1, -1
    next_id = 1
    for frame in frames:
        time_ms, index = frame.get("time_ms"), frame.get("index")
        if (not isinstance(time_ms, int) or time_ms < 0 or time_ms <= previous_time
                or not isinstance(index, int) or index < 0 or index <= previous_index):
            raise ValueError("frames must have strictly increasing nonnegative index and time_ms")
        previous_time, previous_index = time_ms, index
        detections = list(frame.get("detections", []))[:2]
        valid = []
        for det in detections:
            box = det.get("bbox")
            if (isinstance(box, list) and len(box) == 4 and
                    all(isinstance(v, (int, float)) and math.isfinite(v) for v in box) and
                    0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
                valid.append(det)
        candidates = [(tid, row) for tid, row in active.items()
                 if frame["time_ms"] - row["time_ms"] > 0 and
                      frame["index"] - row["index"] <= max_gap_frames]
        costs = [[_distance(row["bbox"], det["bbox"]) for det in valid]
                 for _, row in candidates]
        assignments, ambiguous = {}, False
        if len(candidates) == 1 and len(valid) == 1:
            if costs[0][0] <= gate:
                assignments[0] = candidates[0][0]
        elif len(candidates) == 2 and len(valid) == 2:
            direct, crossed = costs[0][0] + costs[1][1], costs[0][1] + costs[1][0]
            if min(direct, crossed) <= 2 * gate and abs(direct - crossed) >= ambiguity_margin:
                pairs = ((0, 0), (1, 1)) if direct < crossed else ((0, 1), (1, 0))
                for ti, di in pairs:
                    if costs[ti][di] <= gate:
                        assignments[di] = candidates[ti][0]
            elif min(direct, crossed) <= 2 * gate:
                ambiguous = True
        elif len(candidates) == 1 and len(valid) == 2:
            ordered = sorted((costs[0][di], di) for di in range(2))
            if ordered[0][0] <= gate and ordered[1][0] - ordered[0][0] >= ambiguity_margin:
                assignments[ordered[0][1]] = candidates[0][0]
            elif ordered[0][0] <= gate:
                ambiguous = True
        rows = []
        for di, det in enumerate(valid):
            tid = None if ambiguous else assignments.get(di)
            if tid is None and not ambiguous:
                tid, next_id = f"track-{next_id}", next_id + 1
                tracks.append({"track_id": tid, "observations": []})
            if tid is None:
                rows.append({"track_id": None, "association": "ambiguous", "bbox": det["bbox"],
                             "full_body": bool(det.get("full_body", False)),
                             "landmark_quality": det.get("landmark_quality")})
                continue
            active[tid] = {"bbox": det["bbox"], "time_ms": frame["time_ms"], "index": frame["index"]}
            observation = {"time_ms": frame["time_ms"], "bbox": det["bbox"],
                           "full_body": bool(det.get("full_body", False)),
                           "landmark_quality": det.get("landmark_quality"),
                           "association": "matched" if di in assignments else "initialized"}
            next(t for t in tracks if t["track_id"] == tid)["observations"].append(observation)
            rows.append({"track_id": tid, **observation})
        output.append({"time_ms": frame["time_ms"], "association_ambiguous": ambiguous,
                       "detections": rows})
    return {"frames": output, "tracks": tracks, "limitations": [
        "Experimental single-camera 2D tracks; anonymous IDs are not people or roster identities.",
        "No jersey OCR, identity guarantee, court-coordinate transfer, 3D reconstruction, or tracked metrics.",
        "Close crossings and uncertain assignments are reported as ambiguous; gaps are not interpolated."]}
