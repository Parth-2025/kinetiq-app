import numpy as np

PHASE_KEYS = ["ready_position", "load", "set_point", "release", "follow_through"]


def _valid(angles_list: list) -> list:
    return [(i, a) for i, a in enumerate(angles_list) if a is not None]


def classify_camera_view(angles_list: list) -> tuple[str, float]:
    ratios = []
    for _, a in _valid(angles_list):
        h = a.get("torso_height", 0.0)
        if h > 1e-6:
            ratios.append(a.get("torso_width", 0.0) / h)
    if not ratios:
        return "oblique", 0.2
    ratio = float(np.median(ratios))
    if ratio < 0.55:
        return "side", float(min(1.0, 0.5 + (0.55 - ratio)))
    if ratio > 0.9:
        return "front", float(max(0.0, 0.4 - (ratio - 0.9)))
    return "oblique", 0.4


def segment_phases(angles_list: list) -> dict:
    valid = _valid(angles_list)
    view, confidence = classify_camera_view(angles_list)
    none_phases = {k: None for k in PHASE_KEYS}

    if len(valid) < 5:
        return {"phases": none_phases, "camera_view": view, "confidence": confidence}

    set_idx = min(valid, key=lambda x: x[1]["shooting_wrist_y"])[0]

    before = [(i, a) for i, a in valid if i <= set_idx]
    load_idx = min(before, key=lambda x: x[1]["knee_angle"])[0] if before else valid[0][0]

    pre_load = [(i, a) for i, a in valid if i < load_idx]
    if pre_load:
        max_knee = max(a["knee_angle"] for _, a in pre_load)
        upright = [i for i, a in pre_load if a["knee_angle"] >= max_knee - 15.0]
        ready_idx = upright[-1] if upright else pre_load[0][0]
    else:
        ready_idx = valid[0][0]

    after = [(i, a) for i, a in valid if i > set_idx]
    if len(after) >= 2:
        best_vel = None
        release_idx = after[-1][0]
        for k in range(1, len(after)):
            gap = after[k][0] - after[k - 1][0]
            d_elbow = after[k][1]["elbow_angle"] - after[k - 1][1]["elbow_angle"]
            vel = d_elbow / gap if gap else d_elbow
            if best_vel is None or vel > best_vel:
                best_vel = vel
                release_idx = after[k][0]
    elif after:
        release_idx = after[-1][0]
    else:
        release_idx = set_idx

    post = [(i, a) for i, a in valid if i > release_idx]
    above_shoulder = [
        i for i, a in post if a["shooting_wrist_y"] < a.get("shooting_shoulder_y", 1.0)
    ]
    if above_shoulder:
        follow_idx = above_shoulder[-1]
    elif post:
        follow_idx = post[-1][0]
    else:
        follow_idx = valid[-1][0]

    # a truncated clip that ends at/near set point yields no distinct release/follow-through
    if release_idx <= set_idx:
        release_idx = None
    if release_idx is None or follow_idx <= (release_idx or set_idx):
        follow_idx = None

    return {
        "phases": {
            "ready_position": ready_idx,
            "load": load_idx,
            "set_point": set_idx,
            "release": release_idx,
            "follow_through": follow_idx,
        },
        "camera_view": view,
        "confidence": confidence,
    }


def extract_phase_indices(phases: dict) -> dict:
    return {k: phases.get(k) for k in PHASE_KEYS}


def extract_phase_angles(angles_list: list, phases: dict) -> dict:
    out = {}
    for phase in PHASE_KEYS:
        idx = phases.get(phase)
        if idx is not None and 0 <= idx < len(angles_list) and angles_list[idx] is not None:
            out[phase] = angles_list[idx]
        else:
            out[phase] = None
    return out
