SKELETON_CONNECTIONS = [
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("left_ankle", "left_foot"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
    ("right_ankle", "right_foot"),
    ("nose", "left_shoulder"),
    ("nose", "right_shoulder"),
]


def get_joint_color(angle: float, ideal_low: float, ideal_high: float) -> tuple[int, int, int]:
    if ideal_low <= angle <= ideal_high:
        return (0, 220, 0)
    deviation = min(abs(angle - ideal_low), abs(angle - ideal_high))
    if deviation < 20:
        return (0, 200, 255)
    return (0, 0, 255)
