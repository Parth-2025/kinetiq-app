"""Locate the six serve phases in a metric sequence by landmark extrema.

Same shape as basketball's segmenter: collect valid (index, metric) pairs,
forward the shared camera-view classifier, and return one frame index (or
None) per phase key.

Imports: analyzer.camera only (core-purity constraint).
"""
from analyzer.camera import classify_camera_view

PHASE_ORDER = ["stance", "toss", "trophy", "cocking", "contact", "follow_through"]

_MIN_VALID = 6
_STANCE_KNEE_SLACK = 15.0


def _valid(metrics: list) -> list:
    return [(i, m) for i, m in enumerate(metrics) if m is not None]


def segment(metrics: list) -> dict:
    valid = _valid(metrics)
    view, confidence = classify_camera_view(metrics)
    none_phases = {k: None for k in PHASE_ORDER}

    if len(valid) < _MIN_VALID:
        return {"phases": none_phases, "camera_view": view, "confidence": confidence}

    # 1. contact = hitting hand at its highest (smallest y) over the whole clip
    contact_idx = min(valid, key=lambda x: x[1]["dominant_wrist_y"])[0]

    # 2. toss = tossing hand at its highest, at or before contact
    before_contact = [(i, m) for i, m in valid if i <= contact_idx]
    toss_idx = min(before_contact, key=lambda x: x[1]["tossing_wrist_y"])[0]

    # 3. trophy = deepest knee bend strictly between toss and contact
    trophy_window = [(i, m) for i, m in valid if toss_idx < i < contact_idx]
    trophy_idx = (
        min(trophy_window, key=lambda x: x[1]["knee_angle"])[0]
        if trophy_window
        else toss_idx
    )

    # 4. cocking = peak trunk tilt strictly between trophy and contact
    cocking_window = [(i, m) for i, m in valid if trophy_idx < i < contact_idx]
    cocking_idx = (
        max(cocking_window, key=lambda x: x[1]["trunk_tilt"])[0]
        if cocking_window
        else None
    )

    # 5. stance = most upright frame before the toss starts
    pre_toss = [(i, m) for i, m in valid if i < toss_idx]
    if pre_toss:
        max_knee = max(m["knee_angle"] for _, m in pre_toss)
        upright = [i for i, m in pre_toss if m["knee_angle"] >= max_knee - _STANCE_KNEE_SLACK]
        stance_idx = upright[-1] if upright else pre_toss[0][0]
    else:
        stance_idx = valid[0][0]

    # 6. follow_through = last frame after contact with the hitting hand
    #    dropped below the dominant shoulder
    post = [(i, m) for i, m in valid if i > contact_idx]
    dropped = [i for i, m in post if m["dominant_wrist_y"] > m["dominant_shoulder_y"]]
    if dropped:
        follow_idx = dropped[-1]
    elif post:
        follow_idx = post[-1][0]
    else:
        follow_idx = None

    # truncation: a clip ending at/before contact has no distinct later phases
    if contact_idx <= trophy_idx:
        contact_idx = None
        cocking_idx = None
        follow_idx = None
    if follow_idx is not None and follow_idx <= (contact_idx or trophy_idx):
        follow_idx = None

    return {
        "phases": {
            "stance": stance_idx,
            "toss": toss_idx,
            "trophy": trophy_idx,
            "cocking": cocking_idx,
            "contact": contact_idx,
            "follow_through": follow_idx,
        },
        "camera_view": view,
        "confidence": confidence,
    }
