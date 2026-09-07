def score_metric(value: float, lo: float, hi: float, falloff: float) -> float:
    if lo <= value <= hi:
        return 100.0
    dist = min(abs(value - lo), abs(value - hi))
    return max(0.0, round(100.0 * (1.0 - dist / falloff), 1))
