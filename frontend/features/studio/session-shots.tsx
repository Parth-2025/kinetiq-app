import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { numberLabel, useStudio, useStudioAction } from "./data";
import { Input, Notice, Panel, QueryState, ActionError } from "./ui";
import { MotionReplay } from "./motion-replay";
import type { MotionFrame } from "./types";

type Interval = { start_ms: number; end_ms: number };
type Metric = { status: string; minimum: number | null; maximum: number | null; excursion: number | null; valid_samples: number; total_samples: number; unavailable_reason: string | null };
type Attempt = { candidate_id: string; candidate_interval_ms: Interval | null; candidate_provenance: string;
  latest_review: { decision: string; interval_ms: Interval | null; author_id: string; stale?: boolean } | null;
  ball_release_provenance?: { status: string; earliest_ms?: number; latest_ms?: number; reason?: string };
  release_body_report?: { metrics: Record<string, { status: string; minimum: number | null; maximum: number | null; usable_frames: number; unavailable_reason: string | null }> } | null;
  body_report: { metrics: Record<string, Metric> } | null };
type Comparison = { status: string; candidate_count: number; excluded_candidate_count: number; unavailable_reason?: string;
  dispersion_by_measurement?: Record<string, number>; pairwise_absolute_difference?: Record<string, number> };
type Report = { source_analysis_sha256: string; duration_ms: number; attempts: Attempt[];
  counts: { confirmed_count: number; rejected_count: number; pending_count: number };
  consistency: Record<string, Comparison>;
  release_consistency?: Record<string, { status: string; candidate_count: number; excluded_candidate_count: number; dispersion: number | null; pairwise_absolute_difference: number | null; unavailable_reason: string | null }> };

export function SessionShots({ sessionId, canManage, frames }: { sessionId: string; canManage: boolean; frames: MotionFrame[] }) {
  const query = useStudio<Report>(`/sessions/${sessionId}/shots`);
  const action = useStudioAction();
  const [selected, setSelected] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const report = query.value;
  const attempt = report?.attempts.find(a => a.candidate_id === selected);
  const interval = (!attempt?.latest_review?.stale ? attempt?.latest_review?.interval_ms : null) ?? attempt?.candidate_interval_ms;
  const replay = useMemo(() => interval ? frames.filter(f => f.time_ms >= interval.start_ms && f.time_ms < interval.end_ms) : [], [frames, interval?.start_ms, interval?.end_ms]);
  function choose(a: Attempt) {
    setSelected(a.candidate_id);
    const bounds = (!a.latest_review?.stale ? a.latest_review?.interval_ms : null) ?? a.candidate_interval_ms;
    setStart(bounds ? String(bounds.start_ms / 1000) : "");
    setEnd(bounds ? String(bounds.end_ms / 1000) : "");
    setError(null);
  }
  async function save(decision: "confirmed" | "rejected") {
    if (!report || !selected) return;
    const begin = Number(start) * 1000, finish = Number(end) * 1000;
    if (decision === "confirmed" && (!start.trim() || !end.trim() || !Number.isFinite(begin) || !Number.isFinite(finish) || begin < 0 || finish <= begin || finish > report.duration_ms)) {
      setError(`Enter a start and end within the analyzed ${numberLabel(report.duration_ms / 1000, " seconds")}.`); return;
    }
    setError(null);
    await action.run(`/sessions/${sessionId}/shot-reviews`, "POST", {
      candidate_id: selected, source_analysis_sha256: report.source_analysis_sha256, decision,
      interval_ms: decision === "confirmed" ? { start_ms: begin, end_ms: finish } : null,
    });
  }
  return <Panel title="Shots and consistency">
    <QueryState query={query} />
    {report && <>
      <Notice>{report.counts.confirmed_count} reviewed shots · {report.counts.pending_count} pending · {report.counts.rejected_count} rejected. Confirmation records the reviewer's judgment; it does not validate every measurement.</Notice>
      {report.attempts.map(a => <Button key={a.candidate_id} appearance="outline"
        label={`${a.candidate_id} · ${a.latest_review?.stale ? "review outdated" : a.latest_review?.decision ?? "needs review"}`}
        onPress={() => choose(a)} />)}
      {canManage && <Button label="Add a missed shot" appearance="subtle" onPress={() => {
        setSelected(`manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
        setStart(""); setEnd(""); setError(null);
      }} />}
      {selected && <View style={{ gap: 12 }}>
        <Text variant="body1Strong">{selected}</Text>
        {attempt && <Text color="textSecondary">Source: {attempt.candidate_provenance.replaceAll("_", " ")}</Text>}
        {replay.length > 0 && <MotionReplay frames={replay} />}
        {canManage && <>
          <Notice>Set the full movement interval, from preparation through follow-through. Release candidates may cover only a short part of the shot. Confirmed intervals must not overlap.</Notice>
          <Input label="Shot start (seconds)" value={start} onChangeText={setStart} keyboardType="decimal-pad" />
          <Input label="Shot end (seconds)" value={end} onChangeText={setEnd} keyboardType="decimal-pad" />
          <Button label="Confirm shot interval" disabled={action.busy} onPress={() => save("confirmed")} />
          <Button label="Reject candidate" appearance="outline" disabled={action.busy} onPress={() => save("rejected")} />
          <ActionError message={error ?? action.error} />
        </>}
        {Object.entries(attempt?.body_report?.metrics ?? {}).map(([name, m]) => <Text key={name}>
          {name.replaceAll("_", " ")}: {m.status === "available" ? `${numberLabel(m.minimum, "°")} to ${numberLabel(m.maximum, "°")}` : m.unavailable_reason ?? "Unavailable"} · {m.valid_samples}/{m.total_samples} usable samples
        </Text>)}
        {attempt?.ball_release_provenance?.status === "estimated" && <Text>
          Estimated release window: {numberLabel((attempt.ball_release_provenance.earliest_ms ?? 0) / 1000, " s")} to {numberLabel((attempt.ball_release_provenance.latest_ms ?? 0) / 1000, " s")}
        </Text>}
        {Object.entries(attempt?.release_body_report?.metrics ?? {}).map(([name, metric]) => <Text key={name}>
          {name.replaceAll("_", " ")}: {metric.status === "available" ? `${numberLabel(metric.minimum, "°")} to ${numberLabel(metric.maximum, "°")} across ${metric.usable_frames} samples` : metric.unavailable_reason ?? "Unavailable"}
        </Text>)}
      </View>}
      <Text variant="body1Strong">Comparison of reviewed shots</Text>
      <Text color="textSecondary">Two usable shots support a preliminary difference. Three or more support a spread estimate. Similar movement does not establish correct technique.</Text>
      {Object.entries(report.consistency).map(([name, metric]) => <View key={name} style={{ gap: 4 }}>
        <Text>{name.replaceAll("_", " ")} · {metric.candidate_count} usable, {metric.excluded_candidate_count} excluded</Text>
        <Text color="textSecondary">{metric.status === "available" ? "Standard deviation" : metric.status === "preliminary" ? "Preliminary absolute difference" : metric.unavailable_reason ?? "More usable shots needed"}</Text>
        {Object.entries(metric.dispersion_by_measurement ?? metric.pairwise_absolute_difference ?? {}).map(([key, value]) => <Text key={key}>{key}: {numberLabel(value, "°")}</Text>)}
      </View>)}
      <Text variant="body1Strong">Movement near release</Text>
      <Text color="textSecondary">These compare one median body angle per shot across the supported release window. They are estimates near release, not exact release measurements.</Text>
      {Object.entries(report.release_consistency ?? {}).map(([name, metric]) => <View key={name} style={{ gap: 4 }}>
        <Text>{name.replaceAll("_", " ")} · {metric.candidate_count} usable, {metric.excluded_candidate_count} excluded</Text>
        <Text color="textSecondary">{metric.status === "available" ? `Standard deviation: ${numberLabel(metric.dispersion, "°")}` : metric.status === "preliminary" ? `Preliminary difference: ${numberLabel(metric.pairwise_absolute_difference, "°")}` : metric.unavailable_reason ?? "Unavailable"}</Text>
      </View>)}
      <Text color="textSecondary">Physical ball speed, arc and spin remain unavailable without the necessary calibration and visible rotation evidence.</Text>
    </>}
  </Panel>;
}
