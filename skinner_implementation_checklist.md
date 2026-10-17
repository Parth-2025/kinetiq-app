# Skinned mannequin execution checkpoint

## Mannequin appearance and replay: 2026-10-17

- [x] Replace active replay's oval/tube assembly with a warm neutral artist mannequin: profiled chest, waist and pelvis, tapered limb segments, joints, neck, head, oriented palms/thumbs and feet.
- [x] Use the same articulated renderer for raw sessions, shot intervals and saved rig timelines; saved numerical revisions remain unchanged.
- [x] Add display-only fixed median segment lengths, isolated-spike suppression, adaptive temporal smoothing and interpolation bounded to supported samples within 200 ms. Missing joints remain absent; loss of both-hip support hides the figure instead of changing its origin.
- [x] Advance playback by elapsed animation-frame time; retain sampled playback and single-frame navigation. Measurement labels continue to use original samples.
- [x] Focused display-motion checks and TypeScript passed. Web/iOS/Android exports passed. Synthetic front/side/bent-arm geometry and a saved recording pose inspected in Safari.
- [x] Replay one locally available completed recording (249 samples) through 993 interpolated time points: finite supported coordinates, original data unchanged.
- [ ] Confirm both user-reported clips and physical-device rendering. Only one completed recording was available in the local database for this check. Smoothing cannot recover motion the camera failed to observe.

Files: `frontend/features/studio/mannequin-figure.ts`, `articulated-mannequin-scene.tsx`, `display-motion.ts`, `motion-replay.tsx`, and `scripts/test-display-motion.cjs`. The previous capsule/skinned renderer modules remain available but are not the active replay renderer. No source video, analysis values, or database records were rewritten.

## Latest handoff

The configured development database is running and migrated through 0010. Experimental basketball tracking, owner-reviewed shot reports, per-shot replay and quality-aware consistency have been integrated. Resume from [basketball_implementation_checklist.md](basketball_implementation_checklist.md); earlier stopped-database and unimplemented-ball notes below are historical. Native GPU/device validation remains open. Final integrated regression tests are pending; compiler checks passed during this batch.

Updated: 2026-10-16. Resume here after an interruption, then read the relevant sections of `3d_skinner_model.md` and `main_protoype_excution_base.md`.

## Last verified baseline

- [x] Canonical RGB motion read contract and saved interval queries integrated.
- [x] Baseline: 254 backend tests passed, 2 MediaPipe tests excluded; TypeScript and web/iOS/Android exports passed.
- [x] Existing source, shared-session permissions, and historical numerical records preserved.

## Current batch: stable rig and neutral skinned replay

- [x] **R1 implementation** Deterministic session-level bone lengths and display-only fitted poses from canonical joints. Preserve raw numerical analysis, missing data, model scale, and measurement provenance.
- [x] **R2 implementation** Immutable saved rig revisions with input/content hashes, explicit build/read routes, ownership checks, and session-deletion cleanup.
- [x] **R3 implementation** Procedural untextured skinned limb meshes using the saved rig; stable proportions, ordinary replay controls, and hidden unsupported limbs.
- [x] **R4 implementation** Wire revision creation/selection into session review; preserve the existing raw-landmark fallback and clearly label display fitting.
- [x] **R5 automated checks** Geometry, fixed lengths, missing-data propagation, revision idempotency, access revocation, deletion/export, TypeScript, and platform bundling passed.
- [ ] **R5 device checks** Native GPU and authenticated capture/replay on physical devices.
- [x] **R6 documentation** Update both master plans with actual evidence and remaining limits.

## Ownership and interruption rules

- Root owns integration (`backend/main.py`, `backend/alembic/env.py`, session deletion, frontend session/replay wiring) and this checkpoint.
- Agents own disjoint rig fitting, revision storage, and renderer files as recorded below.
- All work stays local; no commit, push, deployment, model download, or paid resource is part of this batch.
- A finished agent is not a verified milestone. Implementation checkboxes mean code is present and reviewed; R5 separately tracks runtime verification. Do not interpret implementation completion as runtime or scientific evidence.
- After a credit interruption: inspect git status, read this file, list agents, inspect partial files, and resume unfinished tasks. Do not recreate completed files or rerun passing checks without a reason.

## Important limits

The next model is a neutral procedural display rig driven by estimated joints. It does not measure body surface, joint forces, camera/world translation, or hidden anatomy. Height/wingspan stay recorded context until a defensible fitting method is implemented. Scientific accuracy, a licensed rich-body estimator, native depth capture, and physical-device validation remain open.

## Active tasks and file boundaries

- `/root/display_rig_fit` (Luna low): `backend/studio/rig_fit.py`, `backend/tests/test_studio_rig_fit.py`. Local handoff: `/private/tmp/kinetiq-rig-fit-progress.md`.
- `/root/rig_revision_storage` (Luna low): `backend/studio/rig_models.py`, `rig_routes.py`, migration `0009_display_rig_revisions.py`, revision tests. Local handoff: `/private/tmp/kinetiq-rig-storage-progress.md`.
- `/root/skinned_display_renderer` (Luna low): `frontend/features/studio/skinned-rig.ts`, `skinned-mannequin-scene.tsx`, geometry test script. Local handoff: `/private/tmp/kinetiq-skinned-renderer-progress.md`.
- Shared interface: `docs/design/display-rig-v1.md`. Root owns integration after agent output review.

## Work log

| Checkpoint | State / evidence | Next action |
| --- | --- | --- |
| 2026-10-06 batch opened | Baseline inspected; implementation not yet verified | Delegate R1/R2/R3, agree payload contract, integrate and verify |
| Delegation checkpoint | Three Luna-low tasks started with disjoint ownership and an agreed 17-joint display rig/API contract | Inspect partial files and task notes before resuming if interrupted |

## Resume point: 2026-10-07

- [x] Registered rig routes and migration model; added revision cleanup to soft session deletion and authorized revisions to data export.
- [x] Connected session review to owner-triggered save, revision selection, explicit landmark fallback, and account/session remount isolation.
- [x] Kept saved revision timelines separate from current raw metric readouts.
- [x] Corrected lower-segment skin weights, skeleton world-matrix updates, group rotation, source-analysis hash, and resource cleanup during source review.
- [x] Final frontend TypeScript compilation passed (`./node_modules/.bin/tsc --noEmit`, 2026-10-07).
- [x] Python compilation passed for rig modules, router/export integration, app registration, and migration. The normal Python cache needed sandbox approval.
- [ ] Apply migration `0009_display_rig_revisions` to the local development database before using save/read/export routes. No database migration was executed this turn.
- [ ] With testing authorization, run existing rig fit/revision and geometry tests, then add missing deletion/export/revocation integration coverage and run it.
- [ ] Inspect actual GL rendering on web/iOS/Android, including scrubbing, bend shape, theme change, orientation, account switch, and context loss. Bundle exports for this batch are also pending.

All three agents finished. No commit or push. Earlier six fit tests passed before the source-hash correction; that result is not a test of the final integrated batch. No automated tests were run this resumed turn. Storage compile checks and frontend compilation passed. The new headless geometry and revision test files are present but unexecuted. Continue from R5; avoid recreating finished files.

Known boundaries: display revisions are private JSONB artifacts with application-level immutability (no database trigger); list returns newest 50 revisions. Surface thickness/head shape are illustrative; proportions are estimated, not calibrated. Height/wingspan remain context. No native depth capture, rich-body inference, GLB export, or accuracy study was added.

## Resume point: 2026-10-16

This supersedes the pending automated checks in the October 7 checkpoint.

- [x] Restored an isolated PostgreSQL 16 test instance at port 55439, data directory `/private/tmp/kinetiq-rig-verification-pg`, database/user `kinetiq_test`. Migrations through 0009 applied by test fixture.
- [x] Seven revision integration tests passed: immutable/idempotent saves, source hashes, snapshot boundaries, sharing/revocation, export isolation, session deletion cleanup.
- [x] Fixed inward-facing limb mesh triangles and expanded headless geometry checks to cover normals, bone endpoints, skin weights/deformation, and disposal. Script passes.
- [x] Backend regression: 275 passed, 2 MediaPipe tests deselected. TypeScript passed.
- [x] Expo exports for web/iOS/Android completed at `/private/tmp/kinetiq-shot-rig-export`.
- [x] Added `shot_analysis.py` per-candidate numerical summary, frontend candidate-review panel, and durable ball/shot evidence contract. Two eligible candidates produce preliminary differences; three or more produce per-metric dispersion. Low-coverage/invalid/gapped intervals are excluded.
- [x] After the two-candidate adjustment: 15 focused candidate/quality tests, TypeScript, and refreshed web/iOS/Android exports passed.
- [ ] Configured development database migration: localhost:5432 connection refused. Start that database, then run `cd backend && .venv/bin/python -m alembic upgrade head` using its existing configuration.
- [ ] Physical-device GL, authenticated end-to-end upload/replay, and native signed builds remain open.
- [ ] Actual ball detector/tracker, athlete-hand association, confirmed shot segmentation/release, calibrated speed/arc, observable spin, and validated consistency feedback. Next implementation contract: `docs/design/basketball-shot-evidence-v1.md`.

New analysis records expose `shot_candidates`; older records remain unchanged and show that the breakdown is unavailable. Existing elbow-motion candidates can include non-shot motion or miss shots. They must not be relabeled confirmed shots. No model download, model choice, ball accuracy claim, commit, or push occurred. All delegated tasks completed.
