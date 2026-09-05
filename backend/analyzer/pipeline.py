from analyzer.sports.base import SportPlugin


def _extract_phase_metrics(metrics: list, phases: dict, phase_order: list) -> dict:
    out: dict = {}
    for phase in phase_order:
        idx = phases.get(phase)
        if idx is not None and 0 <= idx < len(metrics) and metrics[idx] is not None:
            out[phase] = metrics[idx]
        else:
            out[phase] = None
    return out


def run(frames: list, plugin: SportPlugin) -> dict:
    metrics = plugin.frame_metrics(frames)
    seg = plugin.segment(metrics)
    phase_metrics = _extract_phase_metrics(metrics, seg["phases"], plugin.phase_order)
    result = plugin.score(phase_metrics)
    rendered = plugin.render(frames, metrics, seg["phases"], phase_metrics)
    result["sport"] = plugin.name
    result["motion"] = plugin.motion
    result["phase_order"] = list(plugin.phase_order)
    result["camera_view"] = seg["camera_view"]
    result["confidence"] = round(seg["confidence"], 4)
    result["pose_gif"] = rendered["pose_gif"]
    result["phase_images"] = rendered["phase_images"]
    return result
