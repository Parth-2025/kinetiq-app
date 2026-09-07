import numpy as np


def _valid(metrics: list) -> list:
    return [(i, m) for i, m in enumerate(metrics) if m is not None]


def classify_camera_view(metrics: list) -> tuple[str, float]:
    ratios = []
    for _, m in _valid(metrics):
        h = m.get("torso_height", 0.0)
        if h > 1e-6:
            ratios.append(m.get("torso_width", 0.0) / h)
    if not ratios:
        return "oblique", 0.2
    ratio = float(np.median(ratios))
    if ratio < 0.55:
        return "side", float(min(1.0, 0.5 + (0.55 - ratio)))
    if ratio > 0.9:
        return "front", float(max(0.0, 0.4 - (ratio - 0.9)))
    return "oblique", 0.4
