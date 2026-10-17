"""Explicit capability catalogue. Roadmap skills never masquerade as analyzers."""

_BASKETBALL = [
    ("free-throw", "Free throw", "Shooting", "Build a repeatable shooting routine."),
    ("catch-and-shoot", "Catch-and-shoot three", "Shooting", "Connect the catch, setup, and finish."),
    ("pull-up", "Pull-up jumper", "Shooting", "Review your transition from dribble to shot."),
    ("midrange", "Midrange jumper", "Shooting", "Explore your shooting mechanics inside the arc."),
    ("layup", "Layup", "Finishing", "Review your approach and takeoff."),
    ("reverse-layup", "Reverse layup", "Finishing", "Work on finishing around the rim."),
    ("contact-finish", "Finishing through contact", "Finishing", "Review balance through the finish."),
    ("stance", "Defensive stance", "Defense", "Review a stable defensive base."),
    ("shuffle", "Lateral shuffle", "Defense", "Explore lateral movement and foot placement."),
    ("closeout", "Closeout", "Defense", "Connect approach speed with control."),
    ("crossover", "Crossover", "Handling", "Review coordination through a change of direction."),
    ("first-step", "First step", "Footwork", "Explore the start of your drive."),
    ("pivot", "Pivot and post footwork", "Footwork", "Review controlled changes of orientation."),
    ("direction-change", "Change of direction", "Footwork", "Explore turning mechanics."),
    ("deceleration", "Deceleration", "Footwork", "Review how you slow down."),
    ("jump", "Jump mechanics", "Jumping", "Explore your takeoff sequence."),
    ("landing", "Landing mechanics", "Jumping", "Review your return to the floor."),
    ("rebound", "Rebounding jump", "Jumping", "Connect positioning and takeoff."),
    ("passing", "Passing mechanics", "Passing", "Review the movement of a pass."),
    ("sprint", "Sprint mechanics", "Running", "Explore your running movement."),
]

SKILLS = [
    {"id": f"basketball.{key}", "sport": "basketball", "name": name,
     "family": family, "description": description,
     "status": "experimental" if key == "free-throw" else "planned",
     "can_analyze": key == "free-throw", "version": "prototype-1",
     "requirements": ["One athlete", "Full body visible", "Stable camera", "Good lighting"],
     "metrics": ["Elbow flexion", "Knee flexion"] if key == "free-throw" else [],
     "limitations": "Experimental pose estimates. Ball trajectory and shot outcome are not measured."}
    for key, name, family, description in _BASKETBALL
]


def skill(skill_id: str) -> dict | None:
    return next((item for item in SKILLS if item["id"] == skill_id), None)
