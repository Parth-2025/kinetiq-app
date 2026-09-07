import ast
from pathlib import Path

ANALYZER = Path(__file__).resolve().parents[1] / "analyzer"
FORBIDDEN = {"db", "auth", "routers"}


def _first_parties(pyfile: Path) -> set[str]:
    tree = ast.parse(pyfile.read_text())
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            out.add(node.module.split(".")[0])
    return out


def test_analyzer_does_not_import_persistence():
    assert ANALYZER.is_dir()
    offenders = {}
    for py in ANALYZER.rglob("*.py"):
        bad = _first_parties(py) & FORBIDDEN
        if bad:
            offenders[str(py.relative_to(ANALYZER.parent))] = bad
    assert not offenders, offenders
