# Experimental basketball runtime

Implementation checkpoint: 2026-10-16. This describes implemented code, not measured accuracy.

## Setup

From `backend`, use the existing environment and database configuration:

```sh
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m studio.download_ball_model
.venv/bin/python -m uvicorn main:app --reload
```

In another backend terminal, run `.venv/bin/python -m studio.worker`. Start the frontend as described in its README. The model downloads only through the explicit command, verifies its pinned hash, and uses `KINETIQ_MODEL_CACHE_DIR` (default `~/.cache/kinetiq`). `KINETIQ_STUDIO_BALL_ENABLED=false` disables the optional ball pass.

## Runtime and evidence

The worker processes body motion first, then runs a second decode of the original RGB for YOLOX Nano sports-ball detections before deleting video. The generic COCO sports-ball class does not verify that the object is a basketball. Detector confidence is an uncalibrated model score. See [model selection and sources](ball-detector-selection.md).

The ball pass targets samples at least 33 ms apart, at most 1801 samples, 60 seconds of footage, 18000 decoded frames and a 60-second soft processing budget. The worker's overall subprocess timeout remains authoritative. A stuck native inference call can still exhaust the overall timeout. Numerical ball output has a 3 MiB budget so it cannot crowd out body data under the worker's 8 MiB limit; over-budget ball output becomes explicitly unavailable. Slow/incomplete processing is reported as partial. A missing model or ordinary ball-pass exception preserves the body report.

Saved ball data contains original-image normalized boxes/centers, timestamps and frame indices, observed tracklets, gaps, ambiguity counts, model/hash/configuration provenance, and observations with fresh prior wrist/shoulder references. Frames with multiple possible balls or people cannot support a release candidate. There is no interpolation across missing samples. Continuity and association thresholds are provisional, recorded in the result, and need validation.

A candidate is supported by an overhead ball/hand observation followed by upward separation over at least three contiguous observations. Overhead passes can satisfy this rule. These are short **release windows**, not full automatically detected shot boundaries. The system does not infer shot outcome or confirm shot intent.

## Review and reports

- `GET /studio/sessions/{id}/shots`: available to currently authorized session readers; current source hash, candidates, review status, per-shot body summaries and consistency.
- `POST /studio/sessions/{id}/shot-reviews`: owner only. Payload: `candidate_id`, `source_analysis_sha256`, `decision` (`confirmed` or `rejected`), and `interval_ms: {start_ms,end_ms}` for confirmation. Optional note, maximum 2000 characters.
- Candidate IDs are `pose-<index>`, `ball-<attempt-id>` or stable client-generated `manual-<id>`. A missed shot can be entered manually. The reviewer supplies the complete preparation-to-follow-through interval.
- Reviews are append-only application records in `studio_shot_reviews` (migration 0010), retain author/time/source hash, and never mutate predictions. Owner writes lock the session, reject stale hashes and overlapping confirmed intervals, and cap review history at 1000 records per session.
- Shared coaches may read reports; upload ownership determines who can correct attempts. Broader delegated editing is not implemented.
- Soft session deletion deletes reviews. Authorized data exports include review history. Existing account-deletion requests still require the broader account purge workflow.

Body metrics require five usable samples, 70% coverage, and supported interval timing. Comparisons use one summary per reviewed shot with per-metric usable/excluded counts. Two usable shots produce preliminary differences; three or more produce population standard deviation. A stable movement does not establish correct technique.

A unique ball release window wholly inside the reviewed interval can support body-angle observations near release. These require usable finite pose values, endpoint proximity within 100 ms and no pose gaps over 100 ms. One median per supported shot is used for comparison. The displayed range and nearest midpoint frame are estimates near an uncertain release, not exact release angles. Physical ball speed (m/s), calibrated launch arc (degrees) and surface spin (rev/s) remain unavailable.

## UI

Session results show selectable ball tracklets as observed image-plane points, paginated in groups of 20. The canvas retains source aspect ratio. Shot review supports confirmation, rejection, manual intervals, focused movement replay, per-shot body values and two consistency sections. Saved images/video are not required for these numerical views. A reviewer cannot recover visual shot outcome from the numeric replay; source review must happen separately if needed.

Old sessions remain unchanged. Since the source video is deleted after analysis, upload new footage to obtain ball observations. Saved observations can support future numerical queries, but a different detector or surface-rotation analysis requires source video again.

## Remaining validation

Use the [evaluation protocol](../evaluation/basketball-protocol.md). The welcome clips are not ground truth. The evaluator's full-attempt intervals end at release, while UI review intervals extend through follow-through and tracker candidates describe release windows. Do not feed these differing definitions into an IoU benchmark as if they were equivalent. Define and export appropriate predicted full-attempt boundaries before reporting segmentation accuracy; do not score manually corrected predictions as automatic performance.

Final integrated regression tests, physical-device UI/GPU checks, labeled tracking/release accuracy, partial-attempt classification, calibration and rotation extraction remain pending. No accuracy percentages or physical ball measurements are claimed.
