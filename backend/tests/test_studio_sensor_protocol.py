import math

import pytest

from studio.models import Athlete, Device, StudioAccount
from studio.sensor_math import analyze_elbow_series, relative_elbow_angle_deg
from studio.sensor_routes import _parse_csv_samples, _parse_json_samples, _validate_samples

IDENTITY = [1.0, 0.0, 0.0, 0.0]
CALIBRATION = {
    "upper_sensor_to_segment_q": IDENTITY,
    "forearm_sensor_to_segment_q": IDENTITY,
    "neutral_relative_q": IDENTITY,
}


def sample(ts=1.0, forearm_q=IDENTITY, **extra):
    return {"upper_ts_s": ts, "forearm_ts_s": ts, "upper_q": IDENTITY,
            "forearm_q": forearm_q, **extra}


def test_neutral_relative_orientation_is_zero():
    assert relative_elbow_angle_deg(sample(), CALIBRATION)["angle_deg"] == 0


def test_relative_orientation_reports_rotation_without_claiming_anatomical_angle():
    angle = math.radians(35)
    q = [math.cos(angle / 2), math.sin(angle / 2), 0, 0]
    result = relative_elbow_angle_deg(sample(forearm_q=q), CALIBRATION)
    assert result["angle_deg"] == 35
    assert result["quality"] == "relative_orientation"


@pytest.mark.parametrize(("bad_sample", "quality"), [
    (sample(upper_ts_s=float("nan")), "nonfinite_timestamp"),
    (sample(forearm_ts_s=1.1), "timestamp_skew"),
    (sample(attachment_changed=True), "attachment_changed"),
    (sample(forearm_q=[0, 0, 0, 0]), "invalid_quaternion"),
])
def test_quality_gates_null_angle(bad_sample, quality):
    result = relative_elbow_angle_deg(bad_sample, CALIBRATION)
    assert result["angle_deg"] is None
    assert result["quality"] == quality


def test_nonfinite_quaternion_and_timestamp_discontinuity_are_null():
    invalid = sample(forearm_q=[float("inf"), 0, 0, 0])
    assert relative_elbow_angle_deg(invalid, CALIBRATION)["angle_deg"] is None
    values = analyze_elbow_series([sample(1), sample(1.5)], CALIBRATION)
    assert values[1] == {"angle_deg": None, "quality": "timestamp_discontinuity"}


def test_clock_offset_drift_nulls_sample():
    values = analyze_elbow_series([
        sample(1),
        {"upper_ts_s": 1.04, "forearm_ts_s": 1.0, "upper_q": IDENTITY, "forearm_q": IDENTITY},
    ], CALIBRATION)
    assert values[1] == {"angle_deg": None, "quality": "clock_drift"}


def test_json_import_keeps_missing_reading_for_null_quality_output():
    assert _validate_samples(_parse_json_samples(b'{"samples":[{"upper_ts_s":0,"forearm_ts_s":0,"upper_q":[1,0,0,0],"forearm_q":[1,0,0,0]}]}'))[0]["upper_ts_s"] == 0
    missing = _validate_samples(_parse_json_samples(b'[{"attachment_changed":false}]'))
    assert missing[0]["upper_ts_s"] is None
    assert relative_elbow_angle_deg(missing[0], CALIBRATION)["angle_deg"] is None


def test_attachment_change_must_be_boolean():
    with pytest.raises(ValueError, match="must be a boolean"):
        _validate_samples(_parse_json_samples(b'[{"attachment_changed":"false"}]'))


def test_csv_import_requires_paired_quaternion_columns():
    header = b"upper_ts_s,forearm_ts_s,upper_qw,upper_qx,upper_qy,upper_qz,forearm_qw,forearm_qx,forearm_qy,forearm_qz\n"
    parsed = _parse_csv_samples(header + b"0,0,1,0,0,0,1,0,0,0\n")
    assert len(_validate_samples(parsed)) == 1
    with pytest.raises(ValueError, match="missing required"):
        _parse_csv_samples(b"timestamp,quaternion\n0,1;0;0;0\n")


def test_capture_is_bound_to_coach_device_pair_and_calibration(client, db_session, as_user):
    import main
    from auth.dependency import current_user

    coach = as_user(auth0_sub="auth0|sensor-coach")
    db_session.add(StudioAccount(user_id=coach.id, role="coach"))
    athlete = Athlete(creator_id=coach.id, name="Jordan", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    upper = Device(owner_id=coach.id, name="Upper IMU", serial="upper-1", kind="imu", athlete_id=athlete.id)
    forearm = Device(owner_id=coach.id, name="Forearm IMU", serial="forearm-1", kind="imu", athlete_id=athlete.id)
    db_session.add_all([upper, forearm])
    db_session.flush()
    main.app.dependency_overrides[current_user] = lambda: coach

    for device in (upper, forearm):
        configured = client.put(f"/studio/sensors/devices/{device.id}/protocol", json={
            "athlete_id": str(athlete.id), "capabilities": ["orientation_quaternion", "timestamp"],
            "timebase": "device_monotonic", "metadata": {"protocol": "offline_import_v1"},
        })
        assert configured.status_code == 200, configured.text

    calibration = client.post("/studio/sensors/calibrations", json={
        "athlete_id": str(athlete.id), "upper_device_id": str(upper.id),
        "forearm_device_id": str(forearm.id), "upper_sensor_to_segment_q": IDENTITY,
        "forearm_sensor_to_segment_q": IDENTITY, "neutral_relative_q": IDENTITY,
        "timestamp_provenance": {"source": "coach_entered", "clock": "device_monotonic"},
    })
    assert calibration.status_code == 201, calibration.text
    created = client.post("/studio/sensors/captures", json={
        "athlete_id": str(athlete.id), "upper_device_id": str(upper.id),
        "forearm_device_id": str(forearm.id), "calibration_id": calibration.json()["id"],
    })
    assert created.status_code == 201, created.text
    capture_id = created.json()["id"]
    sample_json = b'[{"upper_ts_s":1,"forearm_ts_s":1,"upper_q":[1,0,0,0],"forearm_q":[1,0,0,0]},{}]'
    imported = client.post(f"/studio/sensors/captures/{capture_id}/import",
        files={"file": ("sample.json", sample_json, "application/json")})
    assert imported.status_code == 200, imported.text
    assert imported.json()["live_connection"] is False
    computed = client.get(f"/studio/sensors/captures/{capture_id}/elbow")
    assert computed.status_code == 200, computed.text
    assert computed.json()["results"][0]["angle_deg"] == 0
    assert computed.json()["results"][1]["angle_deg"] is None

    other = as_user(auth0_sub="auth0|sensor-other")
    db_session.add(StudioAccount(user_id=other.id, role="coach"))
    db_session.flush()
    main.app.dependency_overrides[current_user] = lambda: other
    assert client.get(f"/studio/sensors/captures/{capture_id}/elbow").status_code == 404
