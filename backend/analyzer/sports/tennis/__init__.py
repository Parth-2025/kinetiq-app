"""Tennis serve analysis plugin."""
from analyzer.sports.base import SportPlugin
from analyzer.sports.tennis import metrics, phases, scoring


class TennisPlugin(SportPlugin):
    name = "tennis"
    display_name = "Tennis"
    motion = "serve"
    phase_order = phases.PHASE_ORDER

    def frame_metrics(self, frames: list) -> list:
        return metrics.frame_metrics(frames)

    def segment(self, metrics_list: list) -> dict:
        return phases.segment(metrics_list)

    def score(self, phase_metrics: dict) -> dict:
        return scoring.score(phase_metrics)

    def render(self, frames: list, metrics_list: list, phases_dict: dict, phase_metrics: dict) -> dict:
        from analyzer.sports.tennis import rendering

        return rendering.render_all(frames, metrics_list, phases_dict, phase_metrics)


__all__ = ["TennisPlugin"]
