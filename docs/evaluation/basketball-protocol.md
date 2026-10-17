# Basketball shot detector evaluation protocol

This is an evaluation harness and annotation protocol, not a claim of detector performance. Repository welcome/demo clips are unlabeled and are not benchmark data. Publish no metric until a versioned manifest contains human-reviewed labels and predictions from the stated system.

## Data and splits

Use one manifest recording entry per continuous source recording. Assign each recording to `train`, `tune`, or `eval` before model work. Keep every recording from the same athlete in one split; where identity cannot be established, group by session/capture day and document that limitation. Do not tune thresholds, prompts, or code against `eval`. Keep a frozen, access-controlled eval manifest and record its version/hash with reported results. Prefer athlete-disjoint eval; if the sample is too small, disclose the grouping and do not imply athlete generalization.

Every recording requires a stable non-identifying `recording_id`, duration, split, and provenance/consent statement. Use pseudonymous athlete IDs only when needed for leakage prevention. Record source owner, capture date or date range, camera/frame rate, and annotation revision. Obtain informed permission for recording and evaluation, including any retention/sharing scope. Do not put names or other direct identifiers in the manifest.

## Annotation guide

Annotate each actual shot attempt with an interval from the first purposeful shot motion through the ball's release. `release_s` is the frame/time at which the ball leaves the shooter's hand. Use seconds from the start of the source recording, not edited playback time. Mark label state `complete` only when the full event and release are observable enough to judge; set `uncertain` for ambiguous shot-vs-pass or timing, and `incomplete` when clipping/occlusion prevents reliable boundaries. Uncertain/incomplete events are excluded from TP/FP/FN and release scoring, and their counts are reported. Reviewers should label independently and adjudicate disagreement before marking complete.

Include varied cases, with context in `notes`:

- multiple shots and no-shot recordings;
- passes, pump fakes, and dribbles as negative examples (do not annotate these as shots);
- starts/ends clipped by the recording, occlusion, and partially visible releases (mark affected events incomplete);
- multiple balls, recording their presence and identifying the target ball where possible;
- left- and right-handed shooters, varied distances, camera angles, lighting, and clothing.

Do not silently drop hard clips. Keep a no-shot recording's `annotations` empty. If there is no visible shot but the clip is too occluded to know, record coverage limitations in notes and avoid treating it as a confident negative by marking coverage `uncertain` in notes/metadata and excluding the recording from benchmark scoring until reviewed.

## Prediction and scoring

Predictions use the same interval clock and recording IDs. Intervals are matched independently within each recording. A pair is eligible when temporal intersection-over-union (IoU) is at least the selected threshold (default 0.50). Eligible pairs are sorted by descending IoU, then annotation ID and prediction ID; greedy one-to-one assignment prevents a single event from matching multiple detections. This deterministic greedy method is not a globally optimal assignment algorithm. Unmatched predictions are false positives; unmatched complete annotations are false negatives.

Precision = TP/(TP+FP); recall = TP/(TP+FN). A metric with a zero denominator is emitted as JSON `null` (undefined). Release timing is mean absolute error in seconds over matched pairs where both reference and predicted release times exist; it is `null` when no such pair exists. Reports include counts so small samples remain visible. Use eval split for final claims; train/tune output is diagnostic only. Report threshold, manifest revision/hash, number of recordings/annotations/predictions, split policy, excluded-label counts, and the exact code revision alongside results. Do not pool repeatedly inspected eval results into a claim of held-out performance.

Run from repository root:

```sh
python -m backend.studio.shot_evaluation docs/evaluation/basketball-manifest.example.json --split eval --iou-threshold 0.5
```

The example manifest is deliberately empty and produces undefined metrics; it is a format example, not benchmark evidence.
