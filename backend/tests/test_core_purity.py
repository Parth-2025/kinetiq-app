import ast
from pathlib import Path

import pytest

CORE = [
    "geometry.py",
    "scoring_curve.py",
    "camera.py",
    "skeleton.py",
    # legacy modules still present until Task 6 — keep asserting they stay pure
    "angles.py",
    "phases.py",
    "scoring.py",
]
FORBIDDEN = {"fastapi", "cv2", "PIL", "mediapipe", "sqlalchemy", "starlette"}
ANALYZER = Path(__file__).resolve().parents[1] / "analyzer"


@pytest.mark.parametrize("fname", CORE)
def test_core_module_imports_nothing_forbidden(fname):
    tree = ast.parse((ANALYZER / fname).read_text())
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    assert imported.isdisjoint(FORBIDDEN), imported & FORBIDDEN
