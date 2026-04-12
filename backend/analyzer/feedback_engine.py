from typing import Dict, Optional, Tuple

PHASE_IDEALS = {
    "ready_position": {"knee_angle": (160, 175), "shoulder_tilt": (0.0, 0.04), "hip_tilt": (0.0, 0.04)},
    "load":           {"knee_angle": (80, 110),  "elbow_angle": (80, 115),     "hip_angle": (100, 140)},
    "set_point":      {"elbow_angle": (85, 100), "guide_elbow_angle": (60, 100), "knee_angle": (100, 150)},
    "release":        {"elbow_angle": (155, 175),"knee_angle": (160, 180),     "shoulder_tilt": (0.0, 0.05)},
    "follow_through": {"elbow_angle": (155, 180)},
}

PHASE_RESOURCES = {
    "ready_position": [
        {"label": "Set Up Your Footwork Before Your Shot", "url": "https://jr.nba.com/video/set-up-your-footwork-before-your-shot/"},
        {"label": "Fundamentals of Shooting", "url": "https://jr.nba.com/video/fundamentals-of-shooting/"},
    ],
    "load": [
        {"label": "Practice the Shooting Proper Form", "url": "https://jr.nba.com/video/practice-the-shooting-proper-form/"},
        {"label": "Proper Shooting Technique Guide", "url": "https://www.breakthroughbasketball.com/fundamentals/shooting-technique.html"},
    ],
    "set_point": [
        {"label": "Dirk Shows Off Perfect Shooting Form", "url": "https://jr.nba.com/dirk-shows-off-perfect-shooting-form/"},
        {"label": "Form Shooting - 2 Hands", "url": "https://jr.nba.com/video/form-shooting-2-hands/"},
    ],
    "release": [
        {"label": "1-Step Form Shooting", "url": "https://jr.nba.com/video/1-step-form-shooting/"},
        {"label": "Basketball Shooting Resources", "url": "https://www.breakthroughbasketball.com/fundamentals/shooting.html"},
    ],
    "follow_through": [
        {"label": "Perfect Shot (No Basket)", "url": "https://jr.nba.com/video/perfect-shot-no-basket/"},
        {"label": "Jr. NBA at Home: Form Shooting", "url": "https://jr.nba.com/jr-nba-at-home-form-shooting/"},
    ],
}

PHASE_INFO = {
    "ready_position": {"emoji": "🏀", "title": "Ready Position",  "description": "Starting stance before the shot"},
    "load":           {"emoji": "🦵", "title": "Load / Dip",      "description": "Knee bend to generate upward power"},
    "set_point":      {"emoji": "💪", "title": "Set Point",       "description": "Ball position before release"},
    "release":        {"emoji": "🚀", "title": "Release",         "description": "The moment the ball leaves your hand"},
    "follow_through": {"emoji": "🤚", "title": "Follow Through",  "description": "Finishing position after release"},
}

def _score_value(value: float, low: float, high: float) -> float:
    if low <= value <= high:
        return 100.0
    mid = (low + high) / 2
    deviation = max(0, abs(value - mid) - (high - low) / 2)
    return max(0.0, round(100.0 - (deviation / 30.0) * 100.0, 1))

def _generate_feedback(phase: str, angles: Dict) -> Tuple[str, str]:
    side = angles.get("shooting_side", "right")

    if phase == "ready_position":
        tilt = angles.get("shoulder_tilt", 0)
        knee = angles.get("knee_angle", 170)
        if tilt > 0.06:
            return (f"Your shoulders are tilting ({tilt:.2f}) — square up to the basket before your shot.", "warning")
        if knee < 155:
            return (f"You're bending too early ({knee:.0f}°) — stay upright in your ready position.", "warning")
        return ("Great ready position — balanced stance and squared shoulders give you a strong foundation.", "good")

    elif phase == "load":
        knee = angles.get("knee_angle", 95)
        lo, hi = PHASE_IDEALS["load"]["knee_angle"]
        if knee > hi:
            return (f"Knee bend too shallow ({knee:.0f}°) — dip deeper to {lo}–{hi}° to load power into your legs.", "error")
        if knee < lo:
            return (f"Overbending ({knee:.0f}°) — aim for {lo}–{hi}° for explosive upward momentum.", "warning")
        return (f"Excellent leg load at {knee:.0f}° — generating great power from your base.", "good")

    elif phase == "set_point":
        elbow = angles.get("elbow_angle", 90)
        guide = angles.get("guide_elbow_angle", 80)
        lo, hi = PHASE_IDEALS["set_point"]["elbow_angle"]
        if elbow > hi:
            return (f"Elbow too open ({elbow:.0f}°) — tuck it under the ball to {lo}–{hi}° for better control.", "error")
        if elbow < lo:
            return (f"Elbow over-tucked ({elbow:.0f}°) — open slightly to {lo}–{hi}° for a fluid extension.", "warning")
        if guide > 110:
            return (f"Guide hand elbow flaring ({guide:.0f}°) — keep it closer to prevent side-spin.", "warning")
        return (f"Perfect set point at {elbow:.0f}° — elbow nicely positioned under the ball.", "good")

    elif phase == "release":
        elbow = angles.get("elbow_angle", 165)
        lo, hi = PHASE_IDEALS["release"]["elbow_angle"]
        if elbow < lo:
            return (f"Not fully extending at release ({elbow:.0f}°) — straighten to {lo}–{hi}° for maximum arc.", "error")
        tilt = angles.get("shoulder_tilt", 0)
        if tilt > 0.06:
            return ("Body leaning sideways at release — keep shoulders level to improve accuracy.", "warning")
        return (f"Great release at {elbow:.0f}° — transferring maximum power to the ball.", "good")

    elif phase == "follow_through":
        elbow = angles.get("elbow_angle", 170)
        wrist_y = angles.get("shooting_wrist_y", 0.3)
        elbow_y = angles.get("shooting_elbow_y", 0.4)
        wrist_drop = elbow_y - wrist_y
        if wrist_drop < 0:
            return ("Wrist isn't snapping down — hold a 'goose neck' finish with fingers pointing at the rim for 1 second.", "error")
        if elbow < 150:
            return (f"Arm collapsing too early ({elbow:.0f}°) — fully extend and hold your follow-through.", "warning")
        return ("Beautiful follow-through — full extension with wrist snap shows excellent mechanics.", "good")

    return ("Analysis unavailable for this phase.", "warning")

def analyze_form_by_phase(phase_angles: Dict[str, Optional[Dict]]) -> Dict:
    results = {}
    all_scores = []

    for phase in ["ready_position", "load", "set_point", "release", "follow_through"]:
        angles = phase_angles.get(phase)
        info = PHASE_INFO[phase]
        ideals = PHASE_IDEALS[phase]
        resources = PHASE_RESOURCES[phase]

        if angles is None:
            results[phase] = {
                **info,
                "score": 0,
                "status": "unavailable",
                "feedback": "Could not detect this phase — ensure your full body is visible throughout the shot.",
                "resources": resources,
                "angles_measured": {},
            }
            continue

        phase_scores = []
        angles_measured = {}

        for metric, (lo, hi) in ideals.items():
            val = angles.get(metric)
            if val is not None:
                s = _score_value(val, lo, hi)
                phase_scores.append(s)
                angles_measured[metric] = {
                    "value": round(val, 1),
                    "ideal": f"{lo}–{hi}" + ("°" if "angle" in metric else ""),
                    "score": s,
                }

        phase_score = round(sum(phase_scores) / len(phase_scores), 1) if phase_scores else 0
        all_scores.append(phase_score)
        feedback_text, status = _generate_feedback(phase, angles)

        results[phase] = {
            **info,
            "score": phase_score,
            "status": status,
            "feedback": feedback_text,
            "resources": resources,
            "angles_measured": angles_measured,
        }

    overall = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0
    priority = min(results.items(), key=lambda x: x[1].get("score", 100))[0]

    return {"overall_score": overall, "priority": priority, "phases": results}
