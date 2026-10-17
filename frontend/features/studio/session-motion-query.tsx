import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { authorizationHeaders } from "@/config/api";
import { requireRuntimeConfig } from "@/config/runtime";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/theme";
import { Choices, Input, Notice, Panel } from "./ui";

type Joint = "left_elbow" | "right_elbow" | "left_knee" | "right_knee";
type Sample = { time_seconds: number; value: number | null; reason: string | null };
type MotionQueryResult = {
  session_id: string;
  measurement_snapshot_id: string | null;
  revision_id: string | null;
  metric_version: string | null;
  unit: "deg";
  joint: Joint;
  interval_seconds: { start: number; end: number };
  status: string;
  reason?: string | null;
  samples: Sample[];
  total_samples: number;
  valid_samples: number;
  coverage: number;
  time_basis: "decoded_presentation" | "nominal_fallback";
  sample_gaps: { start_seconds: number; end_seconds: number; gap_seconds: number }[];
  aggregations: { min: number | null; max: number | null; mean: number | null };
  limitations: string[];
};

const joints: { value: Joint; label: string }[] = [
  { value: "left_elbow", label: "Left elbow" },
  { value: "right_elbow", label: "Right elbow" },
  { value: "left_knee", label: "Left knee" },
  { value: "right_knee", label: "Right knee" },
];
const PAGE_SIZE = 20;

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "Unavailable";
}

function formatTime(value: number) {
  return value.toFixed(3);
}

export function SessionMotionQuery({ sessionId }: { sessionId: string }) {
  const { user, role } = useAuth();
  const theme = useTheme();
  const [joint, setJoint] = useState<Joint>("right_elbow");
  const [startText, setStartText] = useState("0");
  const [endText, setEndText] = useState("");
  const [result, setResult] = useState<MotionQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const active = useRef(true);
  const inFlight = useRef(false);
  const requestId = useRef(0);
  const latestContext = useRef({ user: user?.sub ?? "", role, sessionId, joint, startText, endText });
  latestContext.current = { user: user?.sub ?? "", role, sessionId, joint, startText, endText };
  const inputKey = useMemo(
    () => `${user?.sub ?? ""}:${role}:${sessionId}:${joint}:${startText}:${endText}`,
    [user?.sub, role, sessionId, joint, startText, endText],
  );

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestId.current += 1;
    };
  }, []);

  useEffect(() => {
    setResult(null);
    setError(null);
    setPage(0);
    requestId.current += 1;
    inFlight.current = false;
    setLoading(false);
  }, [inputKey]);

  async function submit() {
    if (inFlight.current) return;
    const start = Number(startText);
    const end = Number(endText);
    if (!startText.trim() || !endText.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 60) {
      setResult(null);
      setError("Enter an interval within 0 to 60 seconds, with end after start.");
      return;
    }
    const contextAtSubmit = { ...latestContext.current };
    const isCurrent = () => {
      const current = latestContext.current;
      return active.current && id === requestId.current &&
        current.user === contextAtSubmit.user && current.role === contextAtSubmit.role &&
        current.sessionId === contextAtSubmit.sessionId && current.joint === contextAtSubmit.joint &&
        current.startText === contextAtSubmit.startText && current.endText === contextAtSubmit.endText;
    };
    const id = ++requestId.current;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const base = requireRuntimeConfig("kinetiqApiUrl", "Configure the KinetiQ backend URL.");
      const response = await fetch(`${base}/studio/sessions/${encodeURIComponent(sessionId)}/motion-query`, {
        method: "POST",
        headers: { ...authorizationHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "joint_angle_series",
          joint,
          convention: "flexion_0_at_extension",
          interval_seconds: { start, end },
          aggregation: ["min", "max", "mean"],
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const rawDetail = payload && typeof payload === "object" && "detail" in payload
          ? payload.detail
          : null;
        const detail = typeof rawDetail === "string"
          ? rawDetail
          : rawDetail && typeof rawDetail === "object" && "reason" in rawDetail && typeof rawDetail.reason === "string"
            ? `Saved analysis is unsupported: ${rawDetail.reason}`
            : "The interval query could not be completed.";
        throw new Error(detail);
      }
      if (isCurrent()) {
        setResult(payload as MotionQueryResult);
        setPage(0);
      }
    } catch (cause) {
      if (isCurrent()) {
        setError(cause instanceof Error ? cause.message : "The interval query failed.");
      }
    } finally {
      if (id === requestId.current) {
        inFlight.current = false;
        if (active.current) setLoading(false);
      }
    }
  }

  if (role !== "coach") return null;
  const pageCount = result ? Math.max(1, Math.ceil(result.samples.length / PAGE_SIZE)) : 0;
  const visibleSamples = result?.samples.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  return (
    <Panel title="Query a saved interval">
      <Text color="textSecondary">
        Inspect saved joint angles from the start time up to the end time. The end time is excluded. Flexion uses 0° at full extension; missing values are marked unavailable.
      </Text>
      <Text variant="body1Strong">Joint</Text>
      <Choices
        value={joint}
        onChange={(value) => setJoint(value as Joint)}
        options={joints}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Input label="Start seconds" value={startText} onChangeText={setStartText} keyboardType="decimal-pad" placeholder="0" />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Input label="End seconds" value={endText} onChangeText={setEndText} keyboardType="decimal-pad" placeholder="For example, 5.5" />
        </View>
      </View>
      <Button label="Query interval" disabled={loading} onPress={submit} />
      {loading && <ActivityIndicator accessibilityLabel="Querying saved interval" color={theme.color.accent} />}
      {error && <Notice error>{error}</Notice>}
      {!loading && !error && !result && (
        <Text color="textSecondary">Choose a joint and interval to load saved samples.</Text>
      )}
      {result && (
        <>
          {result.status !== "available" && (
            <Notice>{result.reason ?? `This interval query is ${result.status}. No measurement values are available.`}</Notice>
          )}
          <View style={{ borderWidth: 1, borderColor: theme.color.stroke, padding: 14, gap: 10 }}>
            <Text variant="body1Strong">Interval summary</Text>
            <Text>Minimum {formatNumber(result.aggregations.min)}{result.aggregations.min === null ? "" : "°"} · Maximum {formatNumber(result.aggregations.max)}{result.aggregations.max === null ? "" : "°"} · Mean {formatNumber(result.aggregations.mean)}{result.aggregations.mean === null ? "" : "°"}</Text>
            <Text color="textSecondary">{result.valid_samples} of {result.total_samples} stored samples have valid angles · {formatNumber(result.coverage * 100)}% of stored samples</Text>
            <Text color="textSecondary">Time basis: {result.time_basis === "decoded_presentation" ? "decoded presentation timestamps" : "nominal frame timing"}</Text>
            {result.measurement_snapshot_id && <Text color="textSecondary">Linked to the body measurements saved with this session. Reported dimensions do not change these joint angles.</Text>}
            {result.sample_gaps.length > 0 && <Text color="textSecondary">Gaps between samples: {result.sample_gaps.slice(0, 5).map((gap) => `${formatTime(gap.start_seconds)}–${formatTime(gap.end_seconds)} s`).join(", ")}{result.sample_gaps.length > 5 ? `, and ${result.sample_gaps.length - 5} more` : ""}. Coverage above counts stored samples, not time without observations.</Text>}
          </View>
          {result.samples.length === 0 ? (
            <Text color="textSecondary">No saved samples fall in this interval.</Text>
          ) : (
            <View style={{ borderWidth: 1, borderColor: theme.color.stroke }}>
              <View style={{ flexDirection: "row", backgroundColor: theme.color.layerAlt, padding: 10 }}>
                <Text variant="body1Strong" style={{ flex: 1 }}>Time (s)</Text>
                <Text variant="body1Strong" style={{ flex: 1 }}>Angle (°)</Text>
              </View>
              {visibleSamples.map((sample, index) => (
                <View key={`${sample.time_seconds}-${index}`} style={{ flexDirection: "row", padding: 10, borderTopWidth: 1, borderTopColor: theme.color.stroke }}>
                  <Text style={{ flex: 1 }}>{formatTime(sample.time_seconds)}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text>{sample.value === null ? "Unavailable" : `${formatNumber(sample.value)}°`}</Text>
                    {sample.value === null && sample.reason && <Text variant="caption1" color="textSecondary">{sample.reason.replaceAll("_", " ")}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}
          {pageCount > 1 && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Button label="Previous" appearance="outline" disabled={page === 0} onPress={() => setPage((current) => Math.max(0, current - 1))} />
              <Text color="textSecondary">Page {page + 1} of {pageCount}</Text>
              <Button label="Next" appearance="outline" disabled={page + 1 >= pageCount} onPress={() => setPage((current) => Math.min(pageCount - 1, current + 1))} />
            </View>
          )}
          {result.limitations.map((limitation, index) => <Text key={index} variant="caption1" color="textSecondary">{limitation}</Text>)}
        </>
      )}
    </Panel>
  );
}
