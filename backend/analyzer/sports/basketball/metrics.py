from analyzer.geometry import calculate_angle


def _frame_angles(frame: dict, side: str | None = None) -> dict:
    if side is None:
        lw_y = float(frame["left_wrist"][1])
        rw_y = float(frame["right_wrist"][1])
        side = "right" if rw_y < lw_y else "left"
    opp = "left" if side == "right" else "right"

    sh_mid_y = (float(frame["left_shoulder"][1]) + float(frame["right_shoulder"][1])) / 2.0
    hip_mid_y = (float(frame["left_hip"][1]) + float(frame["right_hip"][1])) / 2.0

    return {
        "shooting_side": side,
        "elbow_angle": calculate_angle(
            frame[f"{side}_shoulder"][:3], frame[f"{side}_elbow"][:3], frame[f"{side}_wrist"][:3]
        ),
        "knee_angle": calculate_angle(
            frame[f"{side}_hip"][:3], frame[f"{side}_knee"][:3], frame[f"{side}_ankle"][:3]
        ),
        "hip_angle": calculate_angle(
            frame[f"{side}_shoulder"][:3], frame[f"{side}_hip"][:3], frame[f"{side}_knee"][:3]
        ),
        "guide_elbow_angle": calculate_angle(
            frame[f"{opp}_shoulder"][:3], frame[f"{opp}_elbow"][:3], frame[f"{opp}_wrist"][:3]
        ),
        "shoulder_tilt": abs(float(frame["left_shoulder"][1]) - float(frame["right_shoulder"][1])),
        "hip_tilt": abs(float(frame["left_hip"][1]) - float(frame["right_hip"][1])),
        "shooting_wrist_y": float(frame[f"{side}_wrist"][1]),
        "shooting_elbow_y": float(frame[f"{side}_elbow"][1]),
        "shooting_shoulder_y": float(frame[f"{side}_shoulder"][1]),
        "torso_width": abs(float(frame["left_shoulder"][0]) - float(frame["right_shoulder"][0])),
        "torso_height": abs(hip_mid_y - sh_mid_y),
    }


def frame_metrics(frames: list) -> list:
    lw = [float(f["left_wrist"][1]) for f in frames if f is not None]
    rw = [float(f["right_wrist"][1]) for f in frames if f is not None]
    if not lw and not rw:
        side = None
    else:
        side = "right" if min(rw, default=1.0) <= min(lw, default=1.0) else "left"
    return [_frame_angles(f, side=side) if f is not None else None for f in frames]
