import pytest

from analyzer.registry import SPORTS, UnknownSport, get_plugin, list_sports


def test_basketball_registered():
    p = get_plugin("basketball")
    assert p.name == "basketball"
    assert p is SPORTS["basketball"]


def test_unknown_sport_raises_with_supported_list():
    with pytest.raises(UnknownSport) as exc:
        get_plugin("curling")
    assert exc.value.name == "curling"
    assert "basketball" in exc.value.supported
    assert "curling" in str(exc.value)


def test_list_sports_shape():
    rows = list_sports()
    assert {"name", "display_name", "motion", "phase_order"} == set(rows[0])
    assert rows[0]["name"] == "basketball"
    assert rows[0]["phase_order"][0] == "ready_position"
