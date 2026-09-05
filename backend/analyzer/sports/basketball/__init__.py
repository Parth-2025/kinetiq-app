from analyzer.sports.base import SportPlugin
from analyzer.sports.basketball import metrics, phases, scoring


class BasketballPlugin(SportPlugin):
    name = "basketball"
    display_name = "Basketball"
    motion = "jump shot"
    phase_order = phases.PHASE_ORDER

    def frame_metrics(self, frames: list) -> list:
        return metrics.frame_metrics(frames)

    def segment(self, metrics_list: list) -> dict:
        return phases.segment(metrics_list)

    def score(self, phase_metrics: dict) -> dict:
        return scoring.score(phase_metrics)

    def render(self, frames: list, metrics_list: list, phases_dict: dict, phase_metrics: dict) -> dict:
        from analyzer.sports.basketball import rendering

        return rendering.render_all(frames, metrics_list, phases_dict, phase_metrics)


__all__ = ["BasketballPlugin"]
