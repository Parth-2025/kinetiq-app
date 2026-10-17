"""Bounded, transparent summaries for comparable stored motion sessions."""
from __future__ import annotations

import math

from studio.catalog import skill

WINDOW_DAYS = {7, 30, 90}
MAX_SESSIONS = 12
MIN_VALID_SAMPLES = 8
MIN_COVERAGE = 0.50
METRICS = {"elbow_flexion", "knee_flexion"}


def frame_values(analysis: dict, metric: str) -> list[float]:
    values = []
    frames = analysis.get("frames", []) if isinstance(analysis, dict) else []
    for frame in frames if isinstance(frames, list) else []:
        value = frame.get(metric) if isinstance(frame, dict) else None
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
            values.append(float(value))
    return values


def session_measurement(session, metric: str) -> dict:
    analysis = session.analysis if isinstance(session.analysis, dict) else {}
    frames = analysis.get("frames", [])
    total = len(frames) if isinstance(frames, list) else 0
    values = frame_values(analysis, metric)
    coverage = len(values) / total if total else 0.0
    eligible = len(values) >= MIN_VALID_SAMPLES and coverage >= MIN_COVERAGE
    sorted_values = sorted(values)
    median = (sorted_values[(len(sorted_values)-1)//2] + sorted_values[len(sorted_values)//2]) / 2 if sorted_values else None
    metadata = {
        "version": analysis.get("version"),
        "provider": analysis.get("provider"),
        "angle_convention": analysis.get("angle_convention"),
        "side": analysis.get("side"),
        "capture_mode": (session.source or {}).get("capture_mode"),
    }
    missing = [key for key, value in metadata.items() if not isinstance(value, str) or not value.strip()]
    if missing:
        eligible = False
    return {"session_id": str(session.id), "created_at": session.created_at.isoformat(),
        "valid_samples": len(values), "total_samples": total, "coverage": round(coverage, 3),
        "minimum": min(values) if values else None, "median": median, "maximum": max(values) if values else None,
        "unit": "deg", "comparable": eligible, "metadata": metadata,
        "scope": "whole-clip frame distribution",
        "reason": ("Missing required analysis metadata: " + ", ".join(missing) + "." if missing else
                   None if eligible else "Insufficient valid samples or coverage for this session.")}


def compare_sessions(sessions, metric: str) -> dict:
    rows = [session_measurement(s, metric) for s in sessions]
    candidates = [r for r in rows if r["comparable"]]
    # A uniform analysis contract is required before distributions are compared.
    signatures = {tuple(sorted(r["metadata"].items())) for r in rows
                  if all(isinstance(v, str) and v.strip() for v in r["metadata"].values())}
    mismatch = len(signatures) > 1
    if mismatch:
        for row in rows:
            row["comparable"] = False
            row["reason"] = row["reason"] or "Analysis version, provider, angle convention, side, or capture mode differs."
    return {"metric": metric, "unit": "deg", "minimum_valid_samples": MIN_VALID_SAMPLES,
        "minimum_coverage": MIN_COVERAGE, "sessions": rows,
        "comparable": len(candidates) >= 2 and not mismatch,
        "scope": "per-session whole-clip frame distributions; samples are not pooled",
        "reason": ("Missing required analysis metadata." if any("Missing required" in (r["reason"] or "") for r in rows) else
                   "At least two sessions need sufficient coverage." if len(candidates) < 2 else
                   "Analysis version, provider, angle convention, side, or capture mode differs." if mismatch else None),
        "session_count": len(rows), "comparable_session_count": 0 if mismatch else len(candidates)}


def validate_query(skill_id: str, metric: str, days: int) -> None:
    definition = skill(skill_id)
    if not definition or not definition["can_analyze"]:
        raise ValueError("Choose a supported analyzed skill.")
    if metric not in METRICS:
        raise ValueError("Choose an available motion metric.")
    if days not in WINDOW_DAYS:
        raise ValueError("Choose a 7, 30, or 90 day window.")
