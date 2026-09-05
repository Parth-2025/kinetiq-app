from analyzer.sports.base import SportPlugin
from analyzer.sports.basketball import BasketballPlugin


class UnknownSport(Exception):
    def __init__(self, name: str, supported: list[str]) -> None:
        self.name = name
        self.supported = supported
        super().__init__(f"unknown sport {name!r}; supported: {', '.join(supported)}")


SPORTS: dict[str, SportPlugin] = {p.name: p for p in (BasketballPlugin(),)}


def get_plugin(name: str) -> SportPlugin:
    try:
        return SPORTS[name]
    except KeyError:
        raise UnknownSport(name, sorted(SPORTS)) from None


def list_sports() -> list[dict]:
    return [
        {
            "name": p.name,
            "display_name": p.display_name,
            "motion": p.motion,
            "phase_order": list(p.phase_order),
        }
        for p in SPORTS.values()
    ]
