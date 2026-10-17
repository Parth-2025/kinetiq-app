"""Evaluate shot interval predictions against manually annotated recordings.

Run with ``python -m backend.studio.shot_evaluation MANIFEST.json``.
This module has no runtime dependencies beyond the Python standard library.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


SPLITS = {"train", "tune", "eval"}
LABEL_STATES = {"complete", "uncertain", "incomplete"}


class ManifestError(ValueError):
    """Raised when a manifest is malformed or internally inconsistent."""


def _number(value: Any, where: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ManifestError(f"{where} must be a number")
    value = float(value)
    if not math.isfinite(value):
        raise ManifestError(f"{where} must be finite")
    return value


def _interval(obj: Any, where: str, duration: float) -> tuple[float, float]:
    if not isinstance(obj, dict):
        raise ManifestError(f"{where} must be an object with start_s and end_s")
    start = _number(obj.get("start_s"), f"{where}.start_s")
    end = _number(obj.get("end_s"), f"{where}.end_s")
    if start < 0 or end <= start or end > duration:
        raise ManifestError(f"{where} must satisfy 0 <= start_s < end_s <= duration_s")
    return start, end


def interval_iou(a: tuple[float, float], b: tuple[float, float]) -> float:
    intersection = max(0.0, min(a[1], b[1]) - max(a[0], b[0]))
    union = max(a[1], b[1]) - min(a[0], b[0])
    return intersection / union if union > 0 else 0.0


def _validate_manifest(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or not isinstance(data.get("recordings"), list):
        raise ManifestError("manifest must contain a recordings array")
    seen_recordings: set[str] = set()
    seen_athletes: dict[str, str] = {}
    for ri, rec in enumerate(data["recordings"]):
        where = f"recordings[{ri}]"
        if not isinstance(rec, dict):
            raise ManifestError(f"{where} must be an object")
        rid = rec.get("recording_id")
        if not isinstance(rid, str) or not rid.strip():
            raise ManifestError(f"{where}.recording_id must be a non-empty string")
        if rid in seen_recordings:
            raise ManifestError(f"duplicate recording_id: {rid}")
        seen_recordings.add(rid)
        if rec.get("split") not in SPLITS:
            raise ManifestError(f"{where}.split must be train, tune, or eval")
        duration = _number(rec.get("duration_s"), f"{where}.duration_s")
        if duration <= 0:
            raise ManifestError(f"{where}.duration_s must be positive")
        athlete = rec.get("athlete_id")
        if athlete is not None:
            if not isinstance(athlete, str) or not athlete.strip():
                raise ManifestError(f"{where}.athlete_id must be a non-empty string or null")
            prev = seen_athletes.setdefault(athlete, rec["split"])
            if prev != rec["split"]:
                raise ManifestError(f"athlete {athlete!r} appears in multiple splits")
        for group in ("annotations", "predictions"):
            entries = rec.get(group, [])
            if not isinstance(entries, list):
                raise ManifestError(f"{where}.{group} must be an array")
            ids: set[str] = set()
            for i, entry in enumerate(entries):
                ew = f"{where}.{group}[{i}]"
                if not isinstance(entry, dict):
                    raise ManifestError(f"{ew} must be an object")
                eid = entry.get("id")
                if not isinstance(eid, str) or not eid.strip():
                    raise ManifestError(f"{ew}.id must be a non-empty string")
                if eid in ids:
                    raise ManifestError(f"duplicate {group} id {eid!r} in recording {rid!r}")
                ids.add(eid)
                if group == "annotations":
                    state = entry.get("label_state", "complete")
                    if state not in LABEL_STATES:
                        raise ManifestError(f"{ew}.label_state must be complete, uncertain, or incomplete")
                    # Validate coordinates even when excluded, so bad source data is never silently hidden.
                    interval = _interval(entry.get("interval"), f"{ew}.interval", duration)
                    release = entry.get("release_s")
                    if release is not None:
                        release = _number(release, f"{ew}.release_s")
                        if release < 0 or release > duration:
                            raise ManifestError(f"{ew}.release_s must be within the recording")
                        if state == "complete" and not interval[0] <= release <= interval[1]:
                            raise ManifestError(f"{ew}.release_s must fall within its interval")
                else:
                    _interval(entry.get("interval"), f"{ew}.interval", duration)
                    if entry.get("release_s") is not None:
                        release = _number(entry["release_s"], f"{ew}.release_s")
                        if release < 0 or release > duration:
                            raise ManifestError(f"{ew}.release_s must be within the recording")
    return data


def load_manifest(path: str | Path) -> dict[str, Any]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(str(exc)) from exc
    return _validate_manifest(data)


def evaluate(data: dict[str, Any], split: str, iou_threshold: float = 0.5) -> dict[str, Any]:
    _validate_manifest(data)
    if split not in SPLITS:
        raise ManifestError("split must be train, tune, or eval")
    threshold = _number(iou_threshold, "iou_threshold")
    if threshold < 0 or threshold > 1:
        raise ManifestError("iou_threshold must be between 0 and 1")
    tp = fp = fn = 0
    matched_release_errors: list[float] = []
    excluded = {"uncertain": 0, "incomplete": 0}
    n_recordings = n_annotated = n_predictions = 0
    matched_pairs: list[dict[str, Any]] = []
    for rec in data["recordings"]:
        if rec["split"] != split:
            continue
        n_recordings += 1
        annotations = rec.get("annotations", [])
        gold = [a for a in annotations if a.get("label_state", "complete") == "complete"]
        for a in annotations:
            state = a.get("label_state", "complete")
            if state in excluded:
                excluded[state] += 1
        preds = rec.get("predictions", [])
        n_annotated += len(gold)
        n_predictions += len(preds)
        # Global descending-IoU greedy assignment, with stable ID tie breaks.
        candidates = []
        for gi, g in enumerate(gold):
            g_int = (g["interval"]["start_s"], g["interval"]["end_s"])
            for pi, p in enumerate(preds):
                p_int = (p["interval"]["start_s"], p["interval"]["end_s"])
                score = interval_iou(g_int, p_int)
                if score >= threshold:
                    candidates.append((-score, g["id"], p["id"], gi, pi, score))
        candidates.sort()
        used_g: set[int] = set()
        used_p: set[int] = set()
        for _, _, _, gi, pi, score in candidates:
            if gi in used_g or pi in used_p:
                continue
            used_g.add(gi); used_p.add(pi)
            gold_release = gold[gi].get("release_s")
            if gold_release is not None:
                pred_release = preds[pi].get("release_s")
                if pred_release is not None:
                    pred_release = _number(pred_release, f"prediction {preds[pi]['id']}.release_s")
                    if not 0 <= pred_release <= rec["duration_s"]:
                        raise ManifestError(f"prediction {preds[pi]['id']}.release_s must be within the recording")
                    matched_release_errors.append(abs(pred_release - gold_release))
            matched_pairs.append({"recording_id": rec["recording_id"], "annotation_id": gold[gi]["id"],
                                  "prediction_id": preds[pi]["id"], "iou": score})
        tp += len(used_g); fp += len(preds) - len(used_p); fn += len(gold) - len(used_g)
    return {
        "split": split, "iou_threshold": threshold,
        "sample_counts": {"recordings": n_recordings, "complete_annotations": n_annotated,
                          "predictions": n_predictions, "matched_pairs": tp,
                          "release_error_pairs": len(matched_release_errors), **{f"excluded_{k}": v for k, v in excluded.items()}},
        "interval": {"tp": tp, "fp": fp, "fn": fn,
                     "precision": tp / (tp + fp) if tp + fp else None,
                     "recall": tp / (tp + fn) if tp + fn else None},
        "release_timing": {"mean_absolute_error_s": sum(matched_release_errors) / len(matched_release_errors) if matched_release_errors else None,
                           "sample_count": len(matched_release_errors)},
        "matches": matched_pairs,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", help="JSON manifest path")
    parser.add_argument("--split", choices=sorted(SPLITS), default="eval")
    parser.add_argument("--iou-threshold", type=float, default=0.5)
    args = parser.parse_args(argv)
    try:
        result = evaluate(load_manifest(args.manifest), args.split, args.iou_threshold)
    except ManifestError as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
