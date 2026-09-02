import numpy as np

LANDMARKS = {
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
    "left_heel": 29, "right_heel": 30,
    "left_foot": 31, "right_foot": 32,
    "nose": 0, "left_eye": 2, "right_eye": 5, "left_ear": 7, "right_ear": 8,
}


def calculate_angle(a, b, c) -> float:
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    c = np.asarray(c, dtype=float)
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


def frame_angles(frame: dict) -> dict:
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


def angles_per_frame(frames: list) -> list:
    return [frame_angles(f) if f is not None else None for f in frames]
