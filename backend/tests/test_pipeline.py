from analyzer.pipeline import _extract_phase_metrics, run
from analyzer.sports.base import SportPlugin


class FakePlugin(SportPlugin):
    name = "fake"
    display_name = "Fake"
    motion = "twitch"
    phase_order = ["p1", "p2", "p3"]

    def frame_metrics(self, frames):
        return [None if f is None else {"v": f} for f in frames]

    def segment(self, metrics):
        return {"phases": {"p1": 0, "p2": None, "p3": 2}, "camera_view": "side", "confidence": 0.7123}

    def score(self, phase_metrics):
        return {
            "overall_score": 42.0,
            "priority": "p2",
            "phases": {k: {"score": 0 if v is None else 100} for k, v in phase_metrics.items()},
        }


def test_extract_phase_metrics_handles_none_and_out_of_range():
    metrics = [{"a": 1}, None, {"a": 3}]
    got = _extract_phase_metrics(metrics, {"p1": 0, "p2": 1, "p3": 9, "p4": None}, ["p1", "p2", "p3", "p4"])
    assert got == {"p1": {"a": 1}, "p2": None, "p3": None, "p4": None}


def test_run_merges_additive_keys_and_render_defaults():
    result = run([10, None, 30], FakePlugin())
    assert result["sport"] == "fake"
    assert result["motion"] == "twitch"
    assert result["phase_order"] == ["p1", "p2", "p3"]
    assert result["camera_view"] == "side"
    assert result["confidence"] == 0.7123
    assert result["overall_score"] == 42.0
    assert result["pose_gif"] == ""
    assert result["phase_images"] == {
        "p1": {"user_frame": "", "ideal_frame": ""},
        "p2": {"user_frame": "", "ideal_frame": ""},
        "p3": {"user_frame": "", "ideal_frame": ""},
    }
    # p2 had no index -> scored as missing
    assert result["phases"]["p2"]["score"] == 0
    assert result["phases"]["p1"]["score"] == 100
