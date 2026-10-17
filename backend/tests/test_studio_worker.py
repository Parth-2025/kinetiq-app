import subprocess

import pytest

from studio import worker


def test_isolated_analysis_timeout_is_safe_and_does_not_expose_child_output(tmp_path):
    def timed_out(*args, **kwargs):
        raise subprocess.TimeoutExpired(args[0], kwargs["timeout"], output=b"private diagnostics")

    with pytest.raises(RuntimeError, match="Analysis could not finish"):
        worker.analyze_isolated(tmp_path / "video.mp4", "right", runner=timed_out, timeout=1)


def test_isolated_analysis_child_crash_is_safe(tmp_path):
    class Failed:
        returncode = -6
        stderr = b"native crash details"
        stdout = b""

    with pytest.raises(RuntimeError, match="Analysis could not finish"):
        worker.analyze_isolated(
            tmp_path / "video.mp4", "right", runner=lambda *a, **kw: Failed(), timeout=1
        )


def test_isolated_analysis_validates_child_result(tmp_path):
    class Success:
        returncode = 0
        stderr = stdout = b""

    def writes_result(command, **kwargs):
        from pathlib import Path
        Path(command[-1]).write_text(
            '{"version":"studio-motion-1","frames":[],"summary":{},"repetitions":[]}',
            encoding="utf-8",
        )
        return Success()

    result = worker.analyze_isolated(tmp_path / "video.mp4", "right", runner=writes_result)
    assert result["version"] == "studio-motion-1"


def test_isolated_analysis_rejects_malformed_result(tmp_path):
    class Success:
        returncode = 0
        stderr = stdout = b""

    def writes_result(command, **kwargs):
        from pathlib import Path
        Path(command[-1]).write_text("[]", encoding="utf-8")
        return Success()

    with pytest.raises(RuntimeError, match="Analysis could not finish"):
        worker.analyze_isolated(tmp_path / "video.mp4", "right", runner=writes_result)
