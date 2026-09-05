"""The sport-agnostic core + basketball's non-rendering modules must import
without cv2 / PIL / mediapipe available. Runs in a subprocess with those
modules poisoned so a transitive import fails loudly."""
import subprocess
import sys
import textwrap

_PROBE = textwrap.dedent("""
    import sys, types
    class _Poison(types.ModuleType):
        def __getattr__(self, name):
            raise ImportError(f"{self.__name__} is not available in the pure core")
    for name in ("cv2", "PIL", "PIL.Image", "mediapipe"):
        sys.modules[name] = _Poison(name)
    import analyzer.registry
    import analyzer.pipeline
    from analyzer.registry import get_plugin
    p = get_plugin("basketball")
    # exercising the non-rendering path must not need cv2/PIL either
    from tests.conftest import load_fixture
    m = p.frame_metrics(load_fixture("good_form_side"))
    seg = p.segment(m)
    from analyzer.pipeline import _extract_phase_metrics
    p.score(_extract_phase_metrics(m, seg["phases"], p.phase_order))
    print("PURE_CORE_OK")
""")


def test_core_and_basketball_analysis_import_without_cv2():
    r = subprocess.run(
        [sys.executable, "-c", _PROBE],
        capture_output=True, text=True, cwd=".",
    )
    assert r.returncode == 0, r.stderr
    assert "PURE_CORE_OK" in r.stdout
