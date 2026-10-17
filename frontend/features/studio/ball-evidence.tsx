import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/theme";
import { numberLabel, type BallVideoEvidence } from "./data";
import { Notice, Panel } from "./ui";

function timeLabel(ms: number | null | undefined) {
  return numberLabel(typeof ms === "number" ? ms / 1000 : null, " s");
}

const TRACKS_PER_PAGE = 20;

export function BallEvidence({ ball }: { ball?: BallVideoEvidence }) {
  const theme = useTheme();
  const tracks = useMemo(() => (ball?.tracks ?? []).filter((track) =>
    typeof track.track_id === "string" && Array.isArray(track.points)), [ball]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trackPage, setTrackPage] = useState(0);
  useEffect(() => {
    setSelectedId(null);
    setTrackPage(0);
  }, [ball]);
  const pageCount = Math.max(1, Math.ceil(tracks.length / TRACKS_PER_PAGE));
  const activePage = Math.min(trackPage, pageCount - 1);
  const pageTracks = tracks.slice(activePage * TRACKS_PER_PAGE, (activePage + 1) * TRACKS_PER_PAGE);
  const selected = tracks.find((track) => track.track_id === selectedId) ?? tracks[0];
  const sourceWidth = ball?.source?.width_px;
  const sourceHeight = ball?.source?.height_px;
  const points = (selected?.points ?? []).filter((point) =>
    Number.isFinite(point.center?.[0]) && Number.isFinite(point.center?.[1]) &&
    point.center[0] >= 0 && point.center[0] <= 1 && point.center[1] >= 0 && point.center[1] <= 1);
  const attempts = (ball?.attempts ?? []).filter((attempt) =>
    !selected || attempt.track_id === selected.track_id);
  const hasCanvas = Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight) &&
    (sourceWidth ?? 0) > 0 && (sourceHeight ?? 0) > 0;

  return <Panel title="Ball evidence">
    {!ball ? <Notice>No ball evidence was saved with this analysis. Older sessions keep their body movement review.</Notice> : <>
      <Text color="textSecondary">Image-plane ball positions from observed frames only. Gaps are left visible; the path is not interpolated.</Text>
      <Text variant="body1Strong">{ball.status === "unavailable" ? "Ball evidence unavailable" : `${tracks.length} observed track${tracks.length === 1 ? "" : "s"} · ${attempts.length} candidate interval${attempts.length === 1 ? "" : "s"}`}</Text>
      {!!ball.reason && <Text color="textSecondary">{ball.reason}</Text>}
      {tracks.length > 0 && <>
        <View accessibilityLabel={`Ball track selector, page ${activePage + 1} of ${pageCount}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {pageTracks.map((track) => {
          const active = (selected?.track_id ?? tracks[0]?.track_id) === track.track_id;
          return <Pressable key={track.track_id} accessibilityRole="button" accessibilityLabel={`Select ball track ${track.track_id}${active ? ", selected" : ""}`} accessibilityState={{ selected: active }}
            onPress={() => setSelectedId(track.track_id)} style={{ borderBottomWidth: active ? 2 : 1,
              borderColor: active ? theme.color.accent : theme.color.stroke, paddingVertical: 6, paddingHorizontal: 8 }}>
            <Text color={active ? "text" : "textSecondary"}>{track.track_id} · {track.points.length} observed</Text>
          </Pressable>;
        })}
        </View>
        {pageCount > 1 && <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous ball track page" accessibilityState={{ disabled: activePage === 0 }} disabled={activePage === 0}
            onPress={() => { const next = Math.max(0, activePage - 1); setTrackPage(next); setSelectedId(tracks[next * TRACKS_PER_PAGE]?.track_id ?? null); }}>
            <Text color={activePage === 0 ? "textDisabled" : "text"}>Previous</Text>
          </Pressable>
          <Text color="textSecondary">Page {activePage + 1} of {pageCount}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next ball track page" accessibilityState={{ disabled: activePage >= pageCount - 1 }} disabled={activePage >= pageCount - 1}
            onPress={() => { const next = Math.min(pageCount - 1, activePage + 1); setTrackPage(next); setSelectedId(tracks[next * TRACKS_PER_PAGE]?.track_id ?? null); }}>
            <Text color={activePage >= pageCount - 1 ? "textDisabled" : "text"}>Next</Text>
          </Pressable>
        </View>}
      </>}
      {selected && hasCanvas && <View accessibilityLabel={`Image-plane ball positions for selected track ${selected.track_id}`} accessible style={{ width: "100%", maxWidth: 420, alignSelf: "center", aspectRatio: (sourceWidth as number) / (sourceHeight as number), borderWidth: 1,
        borderColor: theme.color.stroke, backgroundColor: theme.color.bg }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${sourceWidth} ${sourceHeight}`} preserveAspectRatio="xMidYMid meet">
          {points.map((point, index) => <Circle key={`${point.time_ms}-${index}`}
            cx={point.center[0] * (sourceWidth as number)} cy={point.center[1] * (sourceHeight as number)}
            r={Math.max(3, Math.min(9, (sourceWidth as number) * 0.008))} fill={theme.color.accent} />)}
        </Svg>
      </View>}
      {selected && <Text color="textSecondary">{points.length} observed points · {points.length ? `${timeLabel(points[0].time_ms)} to ${timeLabel(points[points.length - 1].time_ms)}` : "No valid points"} · {selected.gap_count ?? 0} timing gaps</Text>}
      {!tracks.length && <Notice>{ball.reason ?? "No ball track was saved for this analysis."}</Notice>}
      {attempts.map((attempt) => {
        const start = attempt.release?.earliest_ms ?? attempt.start_ms;
        const end = attempt.release?.latest_ms ?? attempt.end_ms;
        return <View key={attempt.id} style={{ borderTopWidth: 1, borderColor: theme.color.stroke, paddingTop: 8 }}>
          <Text variant="body1Strong">Candidate release interval · unconfirmed</Text>
          <Text color="textSecondary">{timeLabel(start)} to {timeLabel(end)} · observed ball evidence does not establish shot intent.</Text>
        </View>;
      })}
      {(["speed", "arc", "spin"] as const).map((measure) => {
        const reason = ball.limitations?.find((item) => item.toLowerCase().includes(measure)) ??
          (measure === "speed" ? "No camera calibration or court scale." : measure === "arc" ? "No calibrated camera geometry." : "No rotation evidence.");
        return <Text key={measure} color="textSecondary">{measure[0].toUpperCase() + measure.slice(1)} unavailable: {reason}</Text>;
      })}
      {!!ball.quality && <Text color="textSecondary">Evidence quality · {Object.entries(ball.quality).map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`).join(" · ")}</Text>}
    </>}
  </Panel>;
}
