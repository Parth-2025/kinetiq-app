import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useTheme, type ColorToken } from "@/theme";
import { Text } from "./Text";

export function toneForScore(score: number): ColorToken {
  if (score >= 80) return "success";
  if (score < 50) return "secondary";
  return "accent";
}

export function ScoreRing({
  score,
  size = 120,
  label,
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const stroke = size < 48 ? 4 : 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arc = toneForScore(clamped);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", gap: 2 }}>
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.color.stroke}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.color[arc]}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          strokeLinecap="round"
        />
      </Svg>
      <Text variant={size < 48 ? "caption1Strong" : "title1"}>{Math.round(clamped)}</Text>
      {label && size >= 48 ? (
        <Text variant="caption1" color="textSecondary">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
