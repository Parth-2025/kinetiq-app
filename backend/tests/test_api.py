import io

import pytest
from fastapi.testclient import TestClient

from tests import synth


@pytest.fixture
def client(monkeypatch):
    from analyzer import pose, rendering

    raw = []
    for f in synth.make_shot(n_frames=60):
        f = dict(f)
        f["_frame"] = None
        f["_raw_landmarks"] = None
        raw.append(f)

    monkeypatch.setattr(pose, "extract_landmarks_from_video", lambda _p: raw)
    monkeypatch.setattr(rendering, "generate_pose_gif", lambda *a, **k: "")
    monkeypatch.setattr(
        rendering, "render_phase_images",
        lambda *a, **k: {p: {"user_frame": "", "ideal_frame": ""} for p in
                         ["ready_position", "load", "set_point", "release", "follow_through"]},
    )
    import main
    return TestClient(main.app)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_analyze_returns_legacy_shape_plus_new_fields(client):
    r = client.post("/analyze", files={"video": ("shot.mp4", io.BytesIO(b"x"), "video/mp4")})
    assert r.status_code == 200
    body = r.json()
    assert {"overall_score", "priority", "phases", "pose_gif", "phase_images"} <= body.keys()
    assert body["camera_view"] in {"side", "front", "oblique"}
    assert 0.0 <= body["confidence"] <= 1.0
    assert set(body["phases"]) == {
        "ready_position", "load", "set_point", "release", "follow_through"
    }


def test_analyze_422_when_no_pose(client, monkeypatch):
    from analyzer import pose
    monkeypatch.setattr(pose, "extract_landmarks_from_video", lambda _p: [None] * 30)
    r = client.post("/analyze", files={"video": ("shot.mp4", io.BytesIO(b"x"), "video/mp4")})
    assert r.status_code == 422


def test_analyze_500_hides_internal_error(client, monkeypatch):
    def boom(_p):
        raise RuntimeError("/private/tmp/leaky/path detail")

    from analyzer import pose
    monkeypatch.setattr(pose, "extract_landmarks_from_video", boom)
    r = client.post("/analyze", files={"video": ("shot.mp4", io.BytesIO(b"x"), "video/mp4")})
    assert r.status_code == 500
    assert r.json()["detail"] == "Internal server error"
