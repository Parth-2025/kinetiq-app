"""Score each serve phase against literature-derived ideal bands.

Bands adapted from the 8-stage serve model of Kovacs & Ellenbecker
("An 8-Stage Model for Evaluating the Tennis Serve", Sports Health, 2011)
and ITF / USTA coaching biomechanics, restricted to what MediaPipe Pose
recovers from a side view and tuned for a recreational-player target rather
than tour-level extremes. No dataset exists; these are a first cut and are
expected to be revised once real serve clips run through the pipeline.

Imports: analyzer.scoring_curve + analyzer.sports.tennis.phases only.
"""
from analyzer.scoring_curve import score_metric
from analyzer.sports.tennis.phases import PHASE_ORDER

# phase -> metric -> band. See module docstring for rationale.
IDEALS: dict[str, dict[str, dict]] = {
    "stance": {
        "knee_angle": {"lo": 155.0, "hi": 178.0, "falloff": 25.0},
        "trunk_tilt": {"lo": 0.0, "hi": 12.0, "falloff": 15.0},
    },
    "toss": {
        "tossing_arm_angle": {"lo": 155.0, "hi": 180.0, "falloff": 25.0},
        "contact_reach": {"lo": -0.30, "hi": -0.05, "falloff": 0.15},
    },
    "trophy": {
        "knee_angle": {"lo": 110.0, "hi": 140.0, "falloff": 25.0},
        "hitting_elbow_angle": {"lo": 80.0, "hi": 120.0, "falloff": 30.0},
        "shoulder_tilt": {"lo": 0.03, "hi": 0.12, "falloff": 0.10},
    },
    "cocking": {
        "trunk_tilt": {"lo": 10.0, "hi": 28.0, "falloff": 15.0},
        "shoulder_hip_separation": {"lo": 15.0, "hi": 45.0, "falloff": 25.0},
        "knee_angle": {"lo": 130.0, "hi": 165.0, "falloff": 25.0},
    },
    "contact": {
        "hitting_elbow_angle": {"lo": 150.0, "hi": 180.0, "falloff": 25.0},
        "dominant_arm_elevation": {"lo": 0.0, "hi": 22.0, "falloff": 20.0},
        "contact_reach": {"lo": -0.42, "hi": -0.15, "falloff": 0.15},
        "knee_angle": {"lo": 160.0, "hi": 180.0, "falloff": 20.0},
    },
    "follow_through": {
        "hitting_elbow_angle": {"lo": 30.0, "hi": 90.0, "falloff": 40.0},
    },
}

PHASE_INFO = {
    "stance": {"emoji": "🎾", "title": "Stance",
               "description": "Balanced start, weight ready to load"},
    "toss": {"emoji": "🖐️", "title": "Ball Toss",
             "description": "Tossing arm extended, release up and slightly forward"},
    "trophy": {"emoji": "🏆", "title": "Trophy Pose",
               "description": "Loaded legs, hitting arm cocked back"},
    "cocking": {"emoji": "🏹", "title": "Racket Drop",
                "description": "Peak trunk tilt and shoulder-over-shoulder"},
    "contact": {"emoji": "💥", "title": "Contact",
                "description": "Full extension up to the hitting hand's peak"},
    "follow_through": {"emoji": "🎯", "title": "Follow Through",
                       "description": "Deceleration down and across the body"},
}

_WIKI = "https://en.wikipedia.org/wiki/Serve_(tennis)"
_USTA = "https://www.usta.com/en/home/improve/tips-and-instruction.html"
_ITF = "https://www.itftennis.com/en/growing-the-game/coaching/"

PHASE_RESOURCES = {
    "stance": [
        {"label": "The serve: stance and setup", "url": _WIKI},
        {"label": "USTA tips & instruction", "url": _USTA},
    ],
    "toss": [
        {"label": "The serve: the toss", "url": _WIKI},
        {"label": "USTA tips & instruction", "url": _USTA},
    ],
    "trophy": [
        {"label": "The serve: trophy position", "url": _WIKI},
        {"label": "ITF coaching resources", "url": _ITF},
    ],
    "cocking": [
        {"label": "The serve: racket drop", "url": _WIKI},
        {"label": "ITF coaching resources", "url": _ITF},
    ],
    "contact": [
        {"label": "The serve: the hit", "url": _WIKI},
        {"label": "USTA tips & instruction", "url": _USTA},
    ],
    "follow_through": [
        {"label": "The serve: follow-through", "url": _WIKI},
        {"label": "USTA tips & instruction", "url": _USTA},
    ],
}

_ANGLE_HINTS = ("angle", "tilt", "elevation", "separation")


def _ideal_str(metric: str, band: dict) -> str:
    suffix = "°" if any(h in metric for h in _ANGLE_HINTS) else ""
    return f"{band['lo']:g}–{band['hi']:g}{suffix}"


def generate_feedback(phase: str, metrics: dict) -> tuple[str, str]:
    if phase == "stance":
        tilt = metrics.get("trunk_tilt", 5.0)
        if tilt > 18.0:
            return (f"Leaning back too early ({tilt:.0f}°) — start tall and balanced.", "warning")
        return ("Balanced, upright stance — a stable base to load from.", "good")

    if phase == "toss":
        arm = metrics.get("tossing_arm_angle", 170.0)
        reach = metrics.get("contact_reach", -0.15)
        if arm < 150.0:
            return (f"Tossing arm bent ({arm:.0f}°) — keep it straight and lift, don't throw.", "error")
        if reach > -0.03:
            return ("Toss is landing low — release higher so you hit at full stretch.", "warning")
        return ("Smooth toss with a straight arm — good height to hit at full reach.", "good")

    if phase == "trophy":
        knee = metrics.get("knee_angle", 125.0)
        elbow = metrics.get("hitting_elbow_angle", 100.0)
        lo, hi = IDEALS["trophy"]["knee_angle"]["lo"], IDEALS["trophy"]["knee_angle"]["hi"]
        if knee > hi + 10:
            return (f"Legs barely loaded ({knee:.0f}°) — bend to {lo:.0f}–{hi:.0f}° to drive up.", "error")
        if elbow > 135.0:
            return (f"Hitting arm too open ({elbow:.0f}°) — keep the elbow bent and cocked back.", "warning")
        return (f"Strong trophy pose — legs loaded ({knee:.0f}°) and arm cocked.", "good")

    if phase == "cocking":
        tilt = metrics.get("trunk_tilt", 20.0)
        sep = metrics.get("shoulder_hip_separation", 25.0)
        if tilt < 8.0:
            return (f"Little upper-body coil ({tilt:.0f}°) — let the shoulders tilt back into the drop.", "warning")
        if sep < 12.0:
            return ("Shoulders and hips turning together — separate them to store more power.", "warning")
        return (f"Good racket drop — trunk tilted ({tilt:.0f}°) with shoulder-over-shoulder.", "good")

    if phase == "contact":
        elbow = metrics.get("hitting_elbow_angle", 165.0)
        elev = metrics.get("dominant_arm_elevation", 12.0)
        if elbow < 150.0:
            return (f"Not fully extended at contact ({elbow:.0f}°) — reach up and snap through.", "error")
        if elev > 30.0:
            return (f"Contact point is out to the side ({elev:.0f}° off vertical) — hit more overhead.", "warning")
        return (f"Full extension at contact ({elbow:.0f}°) — reaching up to the peak.", "good")

    if phase == "follow_through":
        elbow = metrics.get("hitting_elbow_angle", 60.0)
        if elbow > 120.0:
            return ("Arm still stiff after contact — let it decelerate down and across your body.", "warning")
        return ("Relaxed deceleration across the body — a complete, balanced finish.", "good")

    return ("Analysis unavailable for this phase.", "warning")


def score(phase_metrics: dict) -> dict:
    results: dict[str, dict] = {}
    all_scores: list[float] = []

    for phase in PHASE_ORDER:
        metrics = phase_metrics.get(phase)
        info = PHASE_INFO[phase]
        resources = PHASE_RESOURCES[phase]

        if metrics is None:
            results[phase] = {
                **info,
                "score": 0,
                "status": "unavailable",
                "feedback": "Could not detect this phase — film the whole serve "
                            "from the side with your full body in frame.",
                "resources": resources,
                "angles_measured": {},
            }
            continue

        phase_scores: list[float] = []
        angles_measured: dict[str, dict] = {}
        for metric, band in IDEALS[phase].items():
            val = metrics.get(metric)
            if val is None:
                continue
            s = score_metric(val, band["lo"], band["hi"], band["falloff"])
            phase_scores.append(s)
            angles_measured[metric] = {
                "value": round(val, 2),
                "ideal": _ideal_str(metric, band),
                "score": s,
            }

        phase_score = round(sum(phase_scores) / len(phase_scores), 1) if phase_scores else 0
        all_scores.append(phase_score)
        feedback_text, status = generate_feedback(phase, metrics)
        results[phase] = {
            **info,
            "score": phase_score,
            "status": status,
            "feedback": feedback_text,
            "resources": resources,
            "angles_measured": angles_measured,
        }

    overall = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0
    priority = min(results.items(), key=lambda kv: kv[1].get("score", 100))[0]
    return {"overall_score": overall, "priority": priority, "phases": results}
