import datetime as dt
from types import SimpleNamespace
import uuid

from studio.comparison import compare_sessions, session_measurement, validate_query


def _session(values, *, version="studio-motion-1", provider="mediapipe-heavy-world",
             convention="flexion_0_at_extension", side="right", capture="rgb"):
    now = dt.datetime.now(dt.timezone.utc)
    return SimpleNamespace(
        id=uuid.uuid4(), created_at=now,
        source={"capture_mode": capture},
        analysis={"version": version, "provider": provider, "angle_convention": convention,
                  "side": side, "frames": [{"elbow_flexion": value} for value in values]},
    )


def test_summary_uses_frame_distribution_and_reports_coverage():
    result = session_measurement(_session([10, 20, 30, 40, 50, 60, 70, 80]), "elbow_flexion")
    assert result["comparable"] is True
    assert result["valid_samples"] == result["total_samples"] == 8
    assert result["coverage"] == 1.0
    assert result["minimum"] == 10
    assert result["median"] == 45
    assert result["maximum"] == 80


def test_low_coverage_is_explicitly_not_comparable():
    result = session_measurement(_session([20, None, None, None, None, None, None, None]), "elbow_flexion")
    assert result["comparable"] is False
    assert result["coverage"] == 0.125
    assert "Insufficient" in result["reason"]


def test_analysis_contract_mismatch_blocks_comparison():
    rows = [_session([float(i) for i in range(8)]), _session([float(i) for i in range(8)], version="studio-motion-2")]
    result = compare_sessions(rows, "elbow_flexion")
    assert result["comparable"] is False
    assert result["comparable_session_count"] == 0
    assert all(not row["comparable"] for row in result["sessions"])
    assert "differs" in result["reason"]


def test_query_allowlist_rejects_unbounded_or_unknown_inputs():
    validate_query("basketball.free-throw", "knee_flexion", 30)
    for args in [("basketball.free-throw", "technique_score", 30),
                 ("basketball.free-throw", "elbow_flexion", 365),
                 ("basketball.sprint", "elbow_flexion", 30)]:
        try:
            validate_query(*args)
        except ValueError:
            pass
        else:
            raise AssertionError(f"query should reject {args}")
