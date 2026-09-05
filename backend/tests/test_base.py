import pytest

from analyzer.sports.base import SportPlugin


class _Dummy(SportPlugin):
    name = "dummy"
    display_name = "Dummy"
    motion = "wiggle"
    phase_order = ["a", "b"]

    def frame_metrics(self, frames):
        return [None for _ in frames]

    def segment(self, metrics):
        return {"phases": {"a": None, "b": None}, "camera_view": "oblique", "confidence": 0.2}

    def score(self, phase_metrics):
        return {"overall_score": 0, "priority": "a", "phases": {}}


def test_cannot_instantiate_abstract():
    with pytest.raises(TypeError):
        SportPlugin()


def test_concrete_subclass_works_and_render_defaults_empty():
    p = _Dummy()
    out = p.render([], [], {}, {})
    assert out["pose_gif"] == ""
    assert out["phase_images"] == {
        "a": {"user_frame": "", "ideal_frame": ""},
        "b": {"user_frame": "", "ideal_frame": ""},
    }
