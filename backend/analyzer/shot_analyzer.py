import numpy as np
from typing import List, Optional, Dict

def detect_shot_phases(angles_list: List[Optional[Dict]]) -> Dict[str, Optional[int]]:
    valid = [(i, a) for i, a in enumerate(angles_list) if a is not None]

    if len(valid) < 5:
        return {"ready_position": None, "load": None, "set_point": None, "release": None, "follow_through": None}

    load_idx = min(valid, key=lambda x: x[1]["knee_angle"])[0]

    before_load = [(i, a) for i, a in valid if i < load_idx]
    ready_idx = max(before_load, key=lambda x: x[1]["knee_angle"])[0] if before_load else valid[0][0]

    after_load = [(i, a) for i, a in valid if i >= load_idx]
    set_point_idx = min(after_load, key=lambda x: x[1]["shooting_wrist_y"])[0] if after_load else valid[len(valid)//2][0]

    after_set = [(i, a) for i, a in valid if i > set_point_idx]
    if len(after_set) >= 3:
        release_idx = after_set[2][0]
    elif after_set:
        release_idx = after_set[-1][0]
    else:
        release_idx = set_point_idx

    follow_through_idx = valid[-1][0]

    return {
        "ready_position": ready_idx,
        "load": load_idx,
        "set_point": set_point_idx,
        "release": release_idx,
        "follow_through": follow_through_idx,
    }

def extract_phase_angles(angles_list: List[Optional[Dict]], phases: Dict[str, Optional[int]]) -> Dict[str, Optional[Dict]]:
    result = {}
    for phase, idx in phases.items():
        if idx is not None and idx < len(angles_list) and angles_list[idx] is not None:
            result[phase] = angles_list[idx]
        else:
            result[phase] = None
    return result

def extract_phase_frames(frames: List[Optional[Dict]], phases: Dict[str, Optional[int]]) -> Dict[str, Optional[Dict]]:
    result = {}
    for phase, idx in phases.items():
        if idx is not None and idx < len(frames) and frames[idx] is not None:
            result[phase] = frames[idx]
        else:
            result[phase] = None
    return result