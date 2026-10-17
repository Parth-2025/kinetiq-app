import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { numberLabel } from "./data";
import { Notice, Panel } from "./ui";

type Metric = {
  minimum: number | null; maximum: number | null; excursion: number | null;
  valid_samples: number; total_samples: number; status: string; unavailable_reason: string | null;
};
type Variation = {
  status: string; candidate_count: number; excluded_candidate_count: number;
  dispersion_by_measurement?: { minimum: number; maximum: number; excursion: number };
  pairwise_absolute_difference?: { minimum: number; maximum: number; excursion: number };
  unavailable_reason: string | null;
};
export type ShotCandidateSummary = {
  schema_version: string;
  candidates: { candidate_index: number; start_ms: number | null; end_ms: number | null;
    usable_body_samples: number; total_samples: number; reason: string;
    metrics: Record<string, Metric> }[];
  cross_candidate_consistency: Record<string, Variation>;
  unavailable_measurements: Record<string, { value: null; unit: string; status: string; reason: string }>;
};

const labels: Record<string, string> = { elbow_flexion: "Elbow flexion", knee_flexion: "Knee flexion" };
export function ShotCandidates({ summary }: { summary?: ShotCandidateSummary }) {
  if (!summary || summary.schema_version !== "shot_candidate_summary.v1") return <Panel title="Shot review">
    <Notice>This recording has no saved per-attempt breakdown. A new analysis is needed for this feature.</Notice>
  </Panel>;
  return <Panel title="Movement candidates">
    <Notice>{summary.candidates.length} body movement candidates found. Body-only candidates do not establish shot intent.</Notice>
    {summary.candidates.length === 0 && <Text>No complete movement sequence met the current visibility and timing checks. This does not mean the clip contains no shots.</Text>}
    {summary.candidates.map((candidate) => <View key={candidate.candidate_index} style={{ gap: 8, paddingVertical: 12 }}>
      <Text variant="body1Strong">Candidate {candidate.candidate_index + 1} · {numberLabel(candidate.start_ms === null ? null : candidate.start_ms / 1000, " s")} to {numberLabel(candidate.end_ms === null ? null : candidate.end_ms / 1000, " s")}</Text>
      <Text color="textSecondary">{candidate.usable_body_samples} of {candidate.total_samples} body samples usable. Unconfirmed shot.</Text>
      {Object.entries(candidate.metrics).map(([key, metric]) => <Text key={key}>
        {labels[key] ?? key}: {metric.status === "available"
          ? `${numberLabel(metric.minimum, "°")} to ${numberLabel(metric.maximum, "°")} · excursion ${numberLabel(metric.excursion, "°")}`
          : metric.unavailable_reason ?? "Unavailable"}
      </Text>)}
    </View>)}
    <Text variant="body1Strong">Variation between candidates</Text>
    <Text color="textSecondary">Lower spread means these observed ranges are more similar. It does not establish good technique or shot consistency. Two usable candidates allow a preliminary comparison; three or more allow a spread estimate.</Text>
    {Object.entries(summary.cross_candidate_consistency).map(([key, value]) => <View key={key} style={{ gap: 6 }}>
      <Text>{labels[key] ?? key} · {value.candidate_count} usable, {value.excluded_candidate_count} excluded</Text>
      {value.status === "available" && value.dispersion_by_measurement ? <Text color="textSecondary">
        Standard deviation: minimum {numberLabel(value.dispersion_by_measurement.minimum, "°")} · maximum {numberLabel(value.dispersion_by_measurement.maximum, "°")} · excursion {numberLabel(value.dispersion_by_measurement.excursion, "°")}
      </Text> : value.status === "preliminary" && value.pairwise_absolute_difference ? <Text color="textSecondary">
        Preliminary difference between two candidates: minimum {numberLabel(value.pairwise_absolute_difference.minimum, "°")} · maximum {numberLabel(value.pairwise_absolute_difference.maximum, "°")} · excursion {numberLabel(value.pairwise_absolute_difference.excursion, "°")}. More attempts are needed to assess repeatability.
      </Text> : <Text color="textSecondary">{value.unavailable_reason ?? "Unavailable"}</Text>}
    </View>)}
  </Panel>;
}
