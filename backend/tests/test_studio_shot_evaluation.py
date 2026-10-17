import json

import pytest

from backend.studio.shot_evaluation import ManifestError, evaluate, load_manifest


def manifest():
    return {"recordings": [{"recording_id": "r1", "athlete_id": "a1", "split": "eval", "duration_s": 10,
        "annotations": [
            {"id": "g1", "interval": {"start_s": 1, "end_s": 3}, "release_s": 2, "label_state": "complete"},
            {"id": "u1", "interval": {"start_s": 4, "end_s": 5}, "label_state": "uncertain"},
        ], "predictions": [
            {"id": "p1", "interval": {"start_s": 1.5, "end_s": 3.5}, "release_s": 2.25},
            {"id": "p2", "interval": {"start_s": 6, "end_s": 7}},
        ]}]}


def test_metrics_exclude_uncertain_and_compute_release_error():
    result = evaluate(manifest(), "eval")
    assert result["interval"] == {"tp": 1, "fp": 1, "fn": 0, "precision": 0.5, "recall": 1.0}
    assert result["release_timing"] == {"mean_absolute_error_s": 0.25, "sample_count": 1}
    assert result["sample_counts"]["excluded_uncertain"] == 1


def test_one_to_one_matching_counts_extra_overlapping_prediction_as_fp():
    data = manifest()
    data["recordings"][0]["predictions"][1]["interval"] = {"start_s": 1, "end_s": 3}
    result = evaluate(data, "eval")
    assert result["interval"]["tp"] == 1
    assert result["interval"]["fp"] == 1


def test_empty_denominators_are_undefined():
    data = {"recordings": [{"recording_id": "empty", "split": "eval", "duration_s": 3,
                            "annotations": [], "predictions": []}]}
    result = evaluate(data, "eval")
    assert result["interval"]["precision"] is None
    assert result["interval"]["recall"] is None
    assert result["release_timing"]["mean_absolute_error_s"] is None


@pytest.mark.parametrize("mutate, message", [
    (lambda d: d["recordings"].append(d["recordings"][0].copy()), "duplicate recording_id"),
    (lambda d: d["recordings"][0]["predictions"].append(d["recordings"][0]["predictions"][0].copy()), "duplicate predictions id"),
    (lambda d: d["recordings"][0]["predictions"][0]["interval"].update(end_s=11), "0 <= start_s"),
])
def test_rejects_invalid_manifest(tmp_path, mutate, message):
    data = manifest(); mutate(data)
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(data))
    with pytest.raises(ManifestError, match=message):
        load_manifest(path)


def test_rejects_athlete_leakage_across_splits():
    data = manifest()
    rec = dict(data["recordings"][0], recording_id="r2", split="train")
    data["recordings"].append(rec)
    with pytest.raises(ManifestError, match="multiple splits"):
        evaluate(data, "eval")
