# Basketball shot evidence v1

Working implementation contract for extending Studio's experimental, body-only analysis into per-shot evidence. This document defines payload semantics and the validation gate; it does not claim model accuracy or select a detector.

## Current boundary

Studio currently decodes the uploaded video, samples pose at approximately 65 ms intervals, downsizes frames whose longest edge exceeds 1280 pixels, stores numerical pose observations, then deletes the source video when analysis finishes. The pose landmarks are hip-relative estimates. Existing pose-motion candidates do not confirm shots, and ball/release/speed/arc/spin are unavailable. The new pipeline must process the original decoded RGB frames while the upload is still available and before worker cleanup. A 15 Hz pose stream is not a ball tracker and cannot recover ball evidence later.

## Required outcomes

- One upload may contain zero, one, or many shot attempts. Detect and report each attempt independently; never merge observations across attempts to improve coverage.
- Detect and report body-motion candidates separately from confirmed shots. `no_shot_detected` means the configured shot detector ran successfully and found no candidate/attempt. `unavailable` means required processing could not run or could not produce interpretable evidence. Do not map detector failure to zero shots.
- Associate each ball track to the selected athlete and shooting hand using explicit temporal and spatial evidence. Preserve ambiguous/unassociated tracks as such; do not attach them by nearest-frame alone.
- Report image-plane ball trajectory whenever supported, distinct from calibrated world-space speed and arc. World quantities require a documented scale/calibration and time basis. Do not label image pixels or hip-relative pose coordinates as physical ball speed, distance, or arc.
- Report spin only from observable ball-surface rotation evidence (for example, stable markings/features across sufficiently resolved frames, or a validated rotation estimator). Ball-center displacement, trajectory curvature, or generic motion is never spin evidence. If no suitable markings/resolution/temporal samples are available, return `unsupported` with the reason and whether a better source is required.
- Include per-shot release timing and phase-aligned metric observations. A release time is an estimate with evidence bounds and provenance, not merely the timestamp of the nearest sampled pose frame.

## Processing stages

1. **Source inventory and decode.** Record source SHA-256, container/codec where available, decoded dimensions, reported and measured frame timing, decoded frame count, and any timestamp fallback. Preserve original-resolution RGB for the detector path. Establish a bounded decode policy for duration, pixel count, and memory; report a processing failure distinctly from no detections.
2. **Athlete selection and body evidence.** Reuse pose observations when available, but retain source frame/time mapping. Identify the target athlete for the clip from an explicit user selection or a stable person track. Existing single-person pose heuristics do not establish identity across a clip. Record body samples, unusable samples, and reasons.
3. **Ball detection and tracking.** Run a selected detector on original-resolution frames at a configured rate high enough for the intended observations. Link detections into tracklets with gaps, occlusions, frame indices, timestamps, image coordinates, box/center, detector/model version, and per-observation quality evidence. A track must expose missing spans and ambiguity; interpolation may aid visualization but cannot be represented as a measured observation.
4. **Track-to-athlete/hand association.** Evaluate approach-to-shooting-hand proximity, continuity, temporal ordering with body phases, and competing athletes/balls. Emit `associated`, `ambiguous`, or `unassociated`, with the supporting interval/evidence and rejected alternatives. Association rules and thresholds are versioned configuration, not silent model behavior.
5. **Attempt segmentation and release.** Propose attempts from body/ball temporal evidence, then determine release only when the track shows a supported separation from the shooting hand and subsequent free-flight continuity. Save release interval `[earliest_ms, latest_ms]`, representative estimate, source frame references, and evidence status. Distinguish a partial attempt clipped at the beginning/end from a complete observable attempt. Do not invent a release for a candidate without sufficient evidence.
6. **Per-shot measurements.** Derive body and ball measurements only within that shot's interval and relevant phase. Keep raw observations and phase labels so a reviewer can reproduce summaries. Phase definitions (gather, set, release, flight) must be versioned and may be unknown when evidence is insufficient.
7. **Cross-shot consistency.** Compare like-for-like metrics, phase definitions, units, detector/config versions, and calibration state. Return detected, usable, and excluded counts, including exclusion reasons. For each metric independently include its eligible/excluded counts and the reason each shot was excluded. Do not use one overall shot count as the support count for every metric.
8. **Persist and clean up.** Persist the bounded numerical observations, provenance, and summaries needed to reproduce every published value before deleting the RGB source. If a metric cannot be reproduced from saved observations and the source is not retained, mark it unavailable with `refit_source_required`; never imply that the deleted source remains available.

## Measurement semantics

Every metric object has `status` (`available`, `partial`, `unavailable`, `unsupported`), `value` or summary fields, `unit`, `valid_samples`, `total_samples`, `coverage`, `unavailable_reason`, and `evidence_refs`. Confidence is evidence-backed and categorical/structured (for example, `high`, `medium`, `low`, `unavailable`) with contributing signals and quality flags; do not emit arbitrary percentage confidence unless calibrated against an evaluation set and calibration method is included.

- **Per-shot body metrics:** retain existing angle convention and source sampling provenance. Align measurements to shot phases via timestamps; report phase support and gaps. Body coverage does not imply ball coverage.
- **Image-plane trajectory:** persist observed center coordinates in pixels and normalized coordinates, original frame size, timestamps, track ID, and gaps. Derive only pixel/normalized displacement, path, and image-plane direction/curvature. Label the projection explicitly; camera motion and perspective remain confounds.
- **Release timing:** milliseconds from clip start with `time_basis`, timing mode (`decoded_presentation` or fallback), uncertainty interval, hand/ball evidence references, and association status.
- **World-space release speed:** only if camera geometry and scale are calibrated, the ball track has sufficient temporal support, and timing provenance is valid. Return m/s with calibration ID/hash, calibration method/version, time source, fit window, and uncertainty method. If any prerequisite fails, unavailable/unsupported; never convert pixel displacement with athlete height alone.
- **World-space arc:** only with a calibrated mapping to a world/court coordinate frame and enough supported flight observations. Define the reported quantity (e.g. vertical release-to-apex rise or fitted launch angle) and coordinate convention in the metric metadata. Keep image-plane curve separate. Arc is not inferred from a few points or a 2D parabola without justified camera geometry.
- **Spin:** output rotations per second only where surface-feature rotation is observable over a documented interval. Include ball-surface feature/marking evidence, sampled frame references, angular-unwrapping method/version, temporal support, and fit residual/quality diagnostics. Generic ball detections and center tracks cannot support spin. Spin may be `unsupported` even when trajectory is available.

## Payload shape

The following is a semantic contract; field names may be adapted to repository conventions while preserving meaning. All times are clip-relative milliseconds. Arrays are bounded and refer to source frame indices so values can be recomputed from retained numerical observations.

```json
{
  "schema_version": "basketball_shot_evidence.v1",
  "status": "available|partial|no_shot_detected|unavailable",
  "source": {
    "sha256": "...", "width_px": 1920, "height_px": 1080,
    "decoded_frame_count": 900, "time_basis": "decoded_presentation",
    "timing_fallback_used": false
  },
  "configuration": {
    "pipeline_version": "...", "pose_model": {"name": "...", "version": "...", "sha256": "..."},
    "ball_detector": {"name": "...", "version": "...", "sha256": "...", "license": "..."},
    "tracking_config_id": "...", "association_config_id": "...",
    "calibration": {"status": "none|available", "id": null, "sha256": null, "method": null}
  },
  "counts": {
    "shot_candidates_detected": 0, "shots_usable": 0, "shots_excluded": 0,
    "exclusions": {"partial_clip": 0, "ambiguous_ball_association": 0, "insufficient_body": 0, "insufficient_ball_track": 0}
  },
  "shots": [{
    "shot_id": "shot-0", "status": "usable|partial|excluded",
    "interval_ms": {"start": 1000, "end": 2600},
    "clip_completeness": "complete|partial_start|partial_end|partial_both",
    "athlete_track_id": "person-0", "shooting_hand": "left|right|unknown",
    "ball_track_id": "ball-1", "ball_association": {"status": "associated|ambiguous|unassociated", "evidence_refs": []},
    "phases": {"schema": "shot_phases.v1", "gather_ms": null, "set_ms": null,
      "release_ms": {"estimate": 1732, "earliest": 1700, "latest": 1765, "status": "available", "evidence_refs": []},
      "flight_start_ms": null, "apex_ms": null, "end_ms": null},
    "body": {"usable_samples": 0, "total_samples": 0, "metrics": {}},
    "ball": {"observed_samples": 0, "total_frames_in_interval": 0, "track_gaps": [],
      "image_plane_trajectory": {"status": "available", "unit": "px", "frame_size_px": [1920, 1080], "observations": []},
      "release_speed": {"status": "unavailable", "value": null, "unit": "m/s", "unavailable_reason": "calibration_required"},
      "arc": {"status": "unavailable", "value": null, "unit": null, "unavailable_reason": "world_calibration_required"},
      "spin": {"status": "unsupported", "value": null, "unit": "rotations/s", "unavailable_reason": "no_observable_surface_features"}}
  }],
  "cross_shot_consistency": {
    "detected_shots": 0, "usable_shots": 0, "excluded_shots": 0,
    "metrics": {"elbow_flexion_excursion": {
      "status": "unavailable", "unit": "deg", "value": null,
      "detected_count": 0, "usable_count": 0, "excluded_count": 0,
      "eligible_shot_ids": [], "excluded": [], "definition": "population_standard_deviation_of_per_shot_excursions"
    }}
  },
  "limitations": []
}
```

`no_shot_detected` requires successful decode, configured detector execution, and a recorded zero-candidate result. Detector not installed, model/license unavailable, unsupported codec, processing timeout, invalid timing, or unusable source must produce `unavailable`, with a stable reason code. An empty `shots` array alone is ambiguous and is not a valid status signal.

For each consistency metric, `excluded` contains `{shot_id, reason}` for every detected attempt not eligible for that metric. `detected_count = usable_count + excluded_count`. Metric eligibility is independent: a shot may support body angles and image trajectory but be excluded from calibrated speed or spin. With too few eligible shots, return the count and an explicit `insufficient_eligible_shots` reason rather than a dispersion value. The minimum support count and coverage rules are configuration fields with version and require validation; do not present a configured minimum as an accuracy guarantee.

## Reproducibility, storage, and provenance

- Store source hash, detector and pose model identifiers/digests, code/pipeline version, configuration IDs and resolved parameters, decoded frame timestamps, original dimensions, and calibration record reference.
- Persist ball observations as numerical data (frame index, timestamp, pixel box/center, feature/rotation observations where applicable, detector output/quality flags, track ID and association state). Persist enough per-frame phase/body values to regenerate shot summaries. Keep arrays bounded by upload/frame caps and result-size limits; if observations exceed limits, use an explicitly versioned artifact with content hash or mark the affected metric non-reproducible.
- Source RGB is ephemeral under the current worker lifecycle. Detector, surface-feature, and other image-derived numerical observations must be generated in the isolated analysis job before source deletion. If saved evidence is insufficient to refit a detector or metric, say `refit_source_required`; source retention policy is a separate explicit product/data decision.
- Record versions of segmentation, association, gap handling, smoothing/fitting, and metric definitions. A result must identify the exact observations and configuration used. Reprocessing creates a new versioned result; it does not silently rewrite prior evidence.
- Detector/model selection and license review remain open. Before adoption, document model source, version/hash, license and redistribution/use constraints, input resolution/rate, runtime/memory bounds, and failure behavior. No specific model or license is endorsed by this contract.

## Configuration and validation gate

All thresholds are named, versioned configuration: detector score gates; minimum visible ball size; frame sampling policy; maximum permitted track gap; minimum observed track support; athlete-hand association distance/time gates; release separation and continuity rules; phase boundaries; per-metric observation/coverage minima; calibration tolerances; and consistency minimum eligible shot count. Store effective values in each analysis result. Thresholds must be selected against a labeled validation set; they are not accuracy claims.

Before enabling a metric beyond experimental/internal status, validate on representative footage with ground truth and report the evaluation protocol and results. Include different ball sizes/markings, lighting, backgrounds, camera motion, distances, frame rates, occlusion, multiple athletes/balls, left/right shooting, partial start/end attempts, no-shot clips, and detector/decoder failures. Annotate shot existence/bounds, athlete/hand association, release interval, ball centers, track gaps, calibrated speed/arc where calibration exists, and spin only where rotation ground truth is observable. Split evaluation by recording/session and avoid near-duplicate frames across splits. Report per-shot precision/recall and localization error, track coverage/center error, association errors, release-time error, and metric error with sample counts and uncertainty. Include failure and abstention rates. Set acceptance thresholds before evaluation; thresholds are currently **TBD** and must be approved from product requirements and validation results. No numeric accuracy threshold is asserted here.

## Open implementation decisions

1. Select ball detector/tracker and verify model provenance/license.
2. Decide whether athlete identity is selected explicitly at upload or established by a validated person tracker.
3. Define supported camera/calibration inputs and whether speed/arc will remain unavailable for uncalibrated single-camera uploads.
4. Decide storage mechanism and size budget for reproducible numerical tracks/rotation observations and model/config artifacts.
5. Choose validated coverage, gap, association, release, phase, and minimum-shot consistency parameters.
6. Establish a labeled basketball validation set and pre-register acceptance thresholds before any user-facing accuracy claim.
