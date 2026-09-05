from abc import ABC, abstractmethod


class SportPlugin(ABC):
    """One analysable sport. Subclasses set the four class attributes and
    implement the three abstract methods; `render` has a no-overlay default."""

    name: str
    display_name: str
    motion: str
    phase_order: list[str]

    @abstractmethod
    def frame_metrics(self, frames: list) -> list:
        """Whole-clip pass: one metric dict per non-None input frame, None
        passthrough for frames with no pose."""

    @abstractmethod
    def segment(self, metrics: list) -> dict:
        """-> {"phases": {phase_key: frame_idx | None},
               "camera_view": str, "confidence": float}
        phase_key ranges over self.phase_order."""

    @abstractmethod
    def score(self, phase_metrics: dict) -> dict:
        """phase_metrics maps every phase_key to that phase's metric dict
        (or None). -> {"overall_score": float, "priority": str,
        "phases": {phase_key: {...}}}"""

    def render(self, frames: list, metrics: list, phases: dict, phase_metrics: dict) -> dict:
        """-> {"pose_gif": str, "phase_images": {phase_key: {"user_frame": str,
        "ideal_frame": str}}}. Default: empty strings for every slot."""
        return {
            "pose_gif": "",
            "phase_images": {
                p: {"user_frame": "", "ideal_frame": ""} for p in self.phase_order
            },
        }
