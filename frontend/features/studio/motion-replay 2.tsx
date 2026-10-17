import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/theme";
import type { MotionFrame } from "./types";
import { Badge, Choices, Notice } from "./ui";
import { numberLabel } from "./data";

const bones = [
  [11, 12, 20],
  [11, 23, 23],
  [12, 24, 23],
  [23, 24, 20],
  [11, 13, 12],
  [13, 15, 10],
  [12, 14, 12],
  [14, 16, 10],
  [23, 25, 17],
  [25, 27, 13],
  [24, 26, 17],
  [26, 28, 13],
  [27, 31, 8],
  [28, 32, 8],
];
export function MotionReplay({ frames }: { frames: MotionFrame[] }) {
  const t = useTheme();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [angle, setAngle] = useState("0");
  const [trackWidth, setTrackWidth] = useState(1);
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [frames]);
  useEffect(() => {
    if (!playing || !frames.length) return;
    if (index >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setIndex((i) => i + 1),
      Math.max(16, frames[index + 1].time_ms - frames[index].time_ms),
    );
    return () => clearTimeout(timer);
  }, [playing, index, frames]);
  const projection = useMemo(() => {
    const theta = (Number(angle) * Math.PI) / 180;
    const all = frames.map((frame) =>
      frame.points.map((p) =>
        p && p[3] >= 0.65
          ? [p[0] * Math.cos(theta) + p[2] * Math.sin(theta), p[1]]
          : null,
      ),
    );
    const points = all.flat().filter((p): p is number[] => !!p);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs, -0.3),
      maxX = Math.max(...xs, 0.3),
      minY = Math.min(...ys, -0.7),
      maxY = Math.max(...ys, 0.8);
    const scale = Math.min(270 / (maxX - minX), 300 / (maxY - minY));
    return all.map((points) =>
      points.map((p) =>
        p
          ? [
              160 + (p[0] - (minX + maxX) / 2) * scale,
              175 + (p[1] - (minY + maxY) / 2) * scale,
            ]
          : null,
      ),
    );
  }, [frames, angle]);
  const frame = frames[index];
  const points = projection[index] ?? [];
  if (!frame) return <Notice>No movement samples are available.</Notice>;
  return (
    <View style={{ gap: 16 }}>
      <View
        accessibilityLabel="Body movement replay from estimated 3D joint positions"
        style={{
          backgroundColor: t.color.layerAlt,
          borderRadius: 0,
          alignItems: "center",
        }}
      >
        <Svg width="100%" height={350} viewBox="0 0 320 350">
          <Line
            x1={20}
            y1={335}
            x2={300}
            y2={335}
            stroke={t.color.stroke}
            strokeWidth={1}
          />
          {bones.map(([a, b, w]) =>
            points[a] && points[b] ? (
              <Line
                key={`${a}-${b}`}
                x1={points[a]![0]}
                y1={points[a]![1]}
                x2={points[b]![0]}
                y2={points[b]![1]}
                stroke={t.color.textSecondary}
                strokeWidth={w}
                strokeLinecap="round"
                opacity={0.7}
              />
            ) : null,
          )}
          {points[0] && (
            <Circle
              cx={points[0][0]}
              cy={points[0][1]}
              r={15}
              fill={t.color.textSecondary}
              opacity={0.7}
            />
          )}
          {[11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((i) =>
            points[i] ? (
              <Circle
                key={i}
                cx={points[i]![0]}
                cy={points[i]![1]}
                r={3.5}
                fill={t.color.accent}
              />
            ) : null,
          )}
        </Svg>
      </View>
      <Choices
        options={[
          { value: "0", label: "Front" },
          { value: "45", label: "Oblique" },
          { value: "90", label: "Side" },
        ]}
        value={angle}
        onChange={setAngle}
      />
      <Text variant="caption1" color="textSecondary">
        Rotate the estimated skeleton. These views do not add camera evidence or
        recover hidden joints.
      </Text>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Replay timeline"
        accessibilityValue={{ min: 0, max: frames.length - 1, now: index }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          setPlaying(false);
          setIndex((i) =>
            Math.max(
              0,
              Math.min(
                frames.length - 1,
                i + (e.nativeEvent.actionName === "increment" ? 1 : -1),
              ),
            ),
          );
        }}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          setPlaying(false);
          setIndex(
            Math.min(
              frames.length - 1,
              Math.max(
                0,
                Math.round(
                  (e.nativeEvent.locationX / trackWidth) * (frames.length - 1),
                ),
              ),
            ),
          );
        }}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <View
          style={{
            height: 6,
            backgroundColor: t.color.stroke,
            borderRadius: 0,
          }}
        >
          <View
            style={{
              height: 6,
              width: `${(index / Math.max(1, frames.length - 1)) * 100}%`,
              backgroundColor: t.color.accent,
              borderRadius: 0,
            }}
          />
        </View>
      </Pressable>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Button
          label={playing ? "Pause" : "Play"}
          appearance="outline"
          onPress={() => {
            if (index === frames.length - 1) setIndex(0);
            setPlaying(!playing);
          }}
        />
        <Button
          label="Previous frame"
          appearance="subtle"
          disabled={index === 0}
          onPress={() => {
            setPlaying(false);
            setIndex((i) => i - 1);
          }}
        />
        <Button
          label="Next frame"
          appearance="subtle"
          disabled={index === frames.length - 1}
          onPress={() => {
            setPlaying(false);
            setIndex((i) => i + 1);
          }}
        />
        <Text color="textSecondary">{(frame.time_ms / 1000).toFixed(2)} s</Text>
      </View>
      {frame.quality && (
        <Badge
          label={
            frame.quality === "usable"
              ? "Pose visibility checks passed"
              : frame.quality
          }
        />
      )}
      <Text>
        Elbow flexion {numberLabel(frame.elbow_flexion, "°")} · Knee flexion{" "}
        {numberLabel(frame.knee_flexion, "°")}
      </Text>
      <Text variant="caption1" color="textSecondary">
        Neutral skeleton preview · low-confidence joints are hidden · 0° means
        full extension.
      </Text>
    </View>
  );
}
