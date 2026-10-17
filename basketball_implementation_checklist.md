# Basketball execution checkpoint

Updated 2026-10-16. Preserve completed work and record evidence before checking off a stage.

- [x] Start configured local PostgreSQL and migrate development database through 0010.
- [x] Prior mannequin software checks: 275 backend tests, headless geometry, TypeScript and platform exports passed.
- [ ] Authenticated capture/replay on physical iPhone; GPU validation requires a device.
- [x] Evaluation manifest, annotation protocol, and executable attempt/release evaluator implemented.
- [ ] Labeled representative footage and held-out accuracy evaluation. Supplied welcome footage is not labeled ground truth.
- [x] Pin/download experimental YOLOX Nano detector; model hash and official implementation provenance recorded. Initial ONNX forward succeeded; later adapter corrections need regression checks.
- [x] Implement numerical ball tracks with gaps, ambiguity and timing before RGB deletion.
- [x] Implement conservative single-person/single-ball hand association and separate release candidates.
- [ ] Validate candidate boundaries, partial-attempt classification, athlete association and release timing on labeled recordings.
- [x] Owner review/correction of individual attempts, separate from immutable predictions; stale-analysis and overlap guards, audit/export/deletion.
- [x] Per-shot replay/report and quality-aware consistency with usable/excluded counts, including supported body angles near release.
- [ ] Run regression tests and authenticated end-to-end review after the final integration changes.
- [ ] Calibrated physical speed/arc and observable rotation in rev/s; unsupported measurements stay null.
- [ ] Evidence-backed coach feedback and representative field validation.

## Current ownership

- Root: runtime integration, API/UI integration, development DB, checkpoint.
- Luna low `ball_detector_adapter`: ONNX adapter, explicit model downloader, detector tests and selection notes.
- Luna low `ball_tracking`: pure tracking/release-candidate logic and tests.
- Luna low `basketball_evaluation`: evaluation CLI, tests and annotation protocol.

## Boundaries

No claim of reliable automatic shot confirmation until evaluated on labeled footage. Generic sports-ball detections may be false positives. Body pose is hip-relative and cannot calibrate ball speed. Ball centroid tracking cannot reveal surface rotation. Human confirmations must retain author and provenance. Commercial model/data suitability and physical-device behavior require separate evidence.

## Restart instructions

Read this checklist and `skinner_implementation_checklist.md`, inspect partial files and agent status, then resume unfinished work. Do not overwrite existing local changes or reinitialize the development database. Model downloads stay outside git. Record any test or inference failure before escalating a task.

## Latest handoff

All three Luna-low assignments finished; root integrated and reviewed their output. No model escalation was needed. PostgreSQL development migration 0010 applied successfully. Model installed at the configured cache path `~/.cache/kinetiq/yolox_nano.onnx` with verified SHA-256. TypeScript and Python compilation passed during integration. Final integration has not had regression tests or authenticated device validation; earlier detector/tracker/evaluator tests predate subsequent fixes and are not evidence for the final batch.

New backend modules: `ball_detector`, `download_ball_model`, `ball_video`, `ball_tracking`, `shot_routes`, `release_analysis`, `shot_evaluation`. New UI: `ball-evidence.tsx`, `session-shots.tsx`. Read `docs/design/basketball-runtime-v1.md` for operating details. Existing sessions cannot regenerate ball evidence after source deletion; upload a new recording.

Next executable work: regression coverage for review permissions/revocation, concurrent overlap/stale writes, soft deletion/export, detector NMS and runtime containment; labeled footage and matching definition; authenticated upload and review flow. Do not claim calibrated speed, 3D launch arc or spin, and do not mark native GPU/scientific validation complete.
