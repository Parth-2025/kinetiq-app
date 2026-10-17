import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/theme";
import { useStudio } from "./data";
import type { Athlete, Overview } from "./types";
import { Badge, Choices, Empty, Notice, Panel, QueryState, Row, StudioScreen } from "./ui";

type SessionCompare = {
  session_id: string; created_at: string; valid_samples: number; total_samples: number;
  coverage: number; minimum: number | null; median: number | null; maximum: number | null;
  comparable: boolean; reason: string | null;
};
type Comparison = {
  athlete_name: string; metric: string; window_days: number; comparable: boolean;
  reason: string | null; session_count: number; comparable_session_count: number; sessions: SessionCompare[];
};
type MotionQuery = {
  athlete_name: string; metric: string; unit: string; window_days: number; session_count: number;
  sessions: SessionCompare[];
  comparable?: boolean; reason?: string | null;
};

const fmt = (n: number | null) => n == null ? "Unavailable" : `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}°`;

export function ComparisonPage() {
  const { role } = useAuth();
  const coach = role === "coach";
  const overview = useStudio<Overview>("/overview");
  const athletes = overview.value?.athletes ?? [];
  const mine = overview.value?.sessions?.[0]?.athlete_id;
  const options: Athlete[] = athletes;
  const [athleteId, setAthleteId] = useState("");
  const [metric, setMetric] = useState("elbow_flexion");
  const [days, setDays] = useState("30");
  const selectedAthlete = athleteId || (coach ? options[0]?.id : mine || options[0]?.id) || "";
  const query = useMemo(() => selectedAthlete
    ? `/comparison?athlete_id=${encodeURIComponent(selectedAthlete)}&skill_id=basketball.free-throw&metric=${metric}&days=${days}` : null,
  [selectedAthlete, metric, days]);
  const comparison = useStudio<Comparison>(query);
  const coachQuery = useMemo(() => coach && selectedAthlete
    ? `/motion-query?athlete_id=${encodeURIComponent(selectedAthlete)}&skill_id=basketball.free-throw&metric=${metric}&days=${days}` : null,
  [coach, selectedAthlete, metric, days]);
  const answer = useStudio<MotionQuery>(coachQuery);
  const t = useTheme();
  return <StudioScreen title="Compare the work." eyebrow={coach ? "Coach motion query" : "Training comparison"}
    subtitle="Review whole-clip frame distributions from saved numeric samples. Coverage and analysis compatibility determine whether sessions can be compared." back>
    <Panel title="Choose a comparison">
      {coach && <Choices value={selectedAthlete} onChange={setAthleteId} options={options.map(a => ({ value: a.id, label: a.name }))} />}
      {!coach && <Text color="textSecondary">Athlete: {overview.value?.name ?? "Your profile"}</Text>}
      <Choices value={metric} onChange={setMetric} options={[
        { value: "elbow_flexion", label: "Elbow flexion" }, { value: "knee_flexion", label: "Knee flexion" },
      ]} />
      <Choices value={days} onChange={setDays} options={[
        { value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" },
      ]} />
      <Text color="textSecondary">Basketball free throw · up to 12 most recent ready sessions</Text>
    </Panel>
    <QueryState query={comparison} />
    {comparison.value && <Panel title={`${comparison.value.athlete_name} · ${metric.replace("_", " ")}`}>
      {!comparison.value.comparable && <Notice>{comparison.value.reason ?? "Not comparable: fewer than two sessions meet coverage requirements."}</Notice>}
      {comparison.value.sessions.length ? comparison.value.sessions.map((s) => <View key={s.session_id} style={{ borderBottomWidth: 1, borderColor: t.color.stroke, paddingVertical: 14, gap: 5 }}>
        <Row title={new Date(s.created_at).toLocaleDateString()} detail={`${fmt(s.minimum)} to ${fmt(s.maximum)} · median ${fmt(s.median)}`} meta={s.comparable ? `${Math.round(s.coverage * 100)}% coverage` : "Not comparable"} />
        <Text color="textSecondary">{s.valid_samples} valid of {s.total_samples} samples{!s.comparable && s.reason ? ` · ${s.reason}` : ""}</Text>
      </View>) : <Empty title="No saved sessions" detail="Ready sessions for this skill and time window will appear here." />}
      <Badge label={`${comparison.value.comparable_session_count} of ${comparison.value.session_count} sessions eligible`} />
    </Panel>}
    {coach && <>
      <QueryState query={answer} />
      {answer.value && <Panel title="Structured motion query">
        {answer.value.comparable === false && <Notice>{answer.value.reason ?? "These sessions cannot be combined."}</Notice>}
        <Text>Saved {answer.value.metric.replace("_", " ")} samples across {answer.value.session_count} sessions in {answer.value.window_days} days.</Text>
        {answer.value.sessions.map(s => <View key={s.session_id} style={{ gap: 5 }}>
          <Text>{new Date(s.created_at).toLocaleDateString()} · {fmt(s.minimum)} — {fmt(s.median)} — {fmt(s.maximum)}</Text>
          <Text color="textSecondary">{s.valid_samples} numeric samples · whole-clip minimum, median, maximum{s.comparable ? "" : ` · ${s.reason ?? "Not comparable"}`}</Text>
        </View>)}
        <Text color="textSecondary">Each clip is summarized separately. Samples from different clips are not pooled.</Text>
        <Notice>This query reads only sessions visible to your account and the selected athlete. It does not infer technique, consistency, or performance.</Notice>
      </Panel>}
    </>}
  </StudioScreen>;
}
