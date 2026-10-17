# Display rig v1 batch contract

Working contract for the 2026-10-06 skinned mannequin batch. This is display fitting; raw analysis and angle queries remain unchanged.

`build_display_rig(motion: CanonicalMotionSession, measurement_values: dict | None = None) -> dict` lives in `backend/studio/rig_fit.py`.

Output fields:

- `schema_version: "display_rig.v1"`, `algorithm_version: "median_lengths_v1"`, `topology_version: "body17_v1"`.
- `source_analysis_sha256`, `measurement_snapshot_id`, `measurement_context` (height/wingspan/provenance only), `measurement_usage: "context_only"`.
- `coordinate_convention: "kinetiq_rh_yup_v1"`, `scale_source: "model_estimated"`, `time_basis` copied from canonical motion.
- `joints: [{name, parent: number|null, source_joint_index: number|null, rest_position_m: [x,y,z]|null, length_m: number|null, support_samples: number}]` in the order below.
- `frames: [{sample_index, time_s, quality, positions_m: ([x,y,z]|null)[]}]`, 17 slots each.
- `limitations: string[]`, `status: "available"|"partial"|"unsupported"`.

| Index | Name | Parent | Source index | Rest direction from parent |
| --- | --- | --- | --- | --- |
| 0 | pelvis | null | midpoint 23,24 | origin |
| 1 | shoulder_center | 0 | midpoint 11,12 | +Y |
| 2 | left_hip | 0 | 23 | +X |
| 3 | right_hip | 0 | 24 | -X |
| 4 | left_shoulder | 1 | 11 | +X |
| 5 | right_shoulder | 1 | 12 | -X |
| 6 | left_elbow | 4 | 13 | +X |
| 7 | right_elbow | 5 | 14 | -X |
| 8 | left_wrist | 6 | 15 | +X |
| 9 | right_wrist | 7 | 16 | -X |
| 10 | left_knee | 2 | 25 | -Y |
| 11 | right_knee | 3 | 26 | -Y |
| 12 | left_ankle | 10 | 27 | -Y |
| 13 | right_ankle | 11 | 28 | -Y |
| 14 | left_foot | 12 | 31 | +Z |
| 15 | right_foot | 13 | 32 | +Z |
| 16 | head_proxy | 1 | 0 (nose, not skull center) | +Y |

Fixed bone length is the median of at least three finite, nondegenerate observations from usable frames. Do not force symmetry, infer absent segments, or turn height/wingspan into invented segment lengths. A null length yields null rest and posed descendants. Each frame uses observed parent-to-child directions at fixed lengths; missing observations propagate down that branch. Root exists only when both hips exist. Multiple-person/no-pose frames have null positions. Partial frames may display only supported branches. All coordinates remain model estimates. The head is an illustrative proxy; body thickness is a template choice.

Persistence API:

- `POST /studio/sessions/{id}/rig-revisions`: ready session owner builds/reuses the current deterministic revision, from stored analysis and its frozen measurement reference. No client-supplied body data. Returns the full revision object.
- `GET /studio/sessions/{id}/rig-revisions`: authorized session readers get summaries under `revisions`.
- `GET /studio/sessions/{id}/rig-revisions/{revision_id}`: authorized session readers get the saved revision and `rig` payload.
- Full revision fields: `id`, `session_id`, `created_at`, `input_sha256`, `artifact_sha256`, `algorithm_version`, `rig`.
- Revision uniqueness covers session, source content, algorithm/topology version, measurement reference and snapshot values. Creation locks the session row; retries reuse the same revision. No mutation endpoint. Session deletion removes stored revisions.

Rendering accepts the `rig` payload above. Use real Three.js `SkinnedMesh`/bones for limb chains with fixed bind lengths. Preserve conservative missing-limb behavior. A procedural skinned mannequin is not a recovered body surface or an accuracy improvement. Keep landmark replay as a visible fallback until native GPU rendering is validated.
