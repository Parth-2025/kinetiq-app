import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/theme";
import type { MotionFrame } from "./types";
import { Badge, Choices, Notice } from "./ui";
import { numberLabel } from "./data";
import { ArticulatedMannequinScene } from "./articulated-mannequin-scene";
import { prepareDisplayMotion, sampleDisplayMotion } from "./display-motion";
import type { DisplayRig } from "./skinned-rig";

export function MotionReplay({ frames, rig }: { frames: MotionFrame[]; rig?: DisplayRig }) {
  const t = useTheme();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [angle, setAngle] = useState("0");
  const [trackWidth, setTrackWidth] = useState(1);
  const [playhead, setPlayhead] = useState(frames[0]?.time_ms ?? 0);
  const [smooth, setSmooth] = useState("smooth");
  const indexRef = useRef(index); indexRef.current = index;
  const displayFrames = useMemo(() => prepareDisplayMotion(frames, rig), [frames, rig]);
  useEffect(() => {
    setIndex(0); setPlaying(false); setPlayhead(frames[0]?.time_ms ?? 0);
  }, [frames, rig]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let request = 0, start: number | null = null;
    const from = frames[indexRef.current]?.time_ms ?? frames[0].time_ms;
    const end = frames[frames.length - 1].time_ms;
    const tick = (now: number) => {
      if (start === null) start = now;
      const current = Math.min(end, from + now - start);
      let lo = 0, hi = frames.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (frames[mid].time_ms <= current) lo = mid; else hi = mid - 1;
      }
      setIndex(lo); setPlayhead(current);
      if (current >= end) setPlaying(false); else request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, frames]);
  const visualTime = playing ? playhead : frames[index]?.time_ms ?? 0;
  const positions = useMemo(() => sampleDisplayMotion(displayFrames,
    smooth === "smooth" ? visualTime : frames[index]?.time_ms ?? 0), [displayFrames, visualTime, smooth, frames, index]);
  const frame = frames[index];
  if (!frame) return <Notice>No movement samples are available.</Notice>;
  return (
    <View style={{ gap: 16 }}>
      <View accessibilityLabel="3D articulated neutral mannequin from estimated pose landmarks">
        <ArticulatedMannequinScene
          positions={positions}
          angle={Number(angle)}
          background={t.color.layerAlt}
          tone={t.color.textSecondary}
        />
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
      <Choices value={smooth} onChange={setSmooth} options={[
        { value: "smooth", label: "Smooth playback" },
        { value: "sampled", label: "Sampled playback" },
      ]} />
      <Text variant="caption1" color="textSecondary">
        {rig ? "Saved display rig with fixed estimated limb lengths. " : "Neutral articulated mannequin with stable display proportions. "}Body
        shape and hidden joints remain unmeasured; rotating the preview adds no
        camera evidence.
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
        <View style={{ height: 6, backgroundColor: t.color.stroke, borderRadius: 0 }}>
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
        <Text color="textSecondary">{(visualTime / 1000).toFixed(2)} s</Text>
      </View>
      {frame.quality && (
        <Badge label={frame.quality === "usable" ? "Pose visibility checks passed" : frame.quality} />
      )}
      {!rig && <Text>
        Elbow flexion {numberLabel(frame.elbow_flexion, "°")} · Knee flexion{" "}
        {numberLabel(frame.knee_flexion, "°")}
      </Text>}
      <Text variant="caption1" color="textSecondary">
        {rig ? "Visual smoothing does not change recorded metrics. Unsupported limbs are hidden; height and wingspan are context only." : "Display smoothing only · missing joints stay hidden · measurements below use original samples."}
      </Text>
    </View>
  );
}
