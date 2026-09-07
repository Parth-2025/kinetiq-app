import { View } from "react-native";

import { useTheme, type ColorToken } from "@/theme";
import { Text } from "./Text";

type Tone = "neutral" | "accent" | "success" | "danger";

export function Chip({ label, tone = "neutral", dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = useTheme();
  const bg: ColorToken = tone === "neutral" ? "layerAlt" : (`${tone}Subtle` as ColorToken);
  const fg: ColorToken = tone === "neutral" ? "textSecondary" : tone;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.xs,
        backgroundColor: t.color[bg],
        borderRadius: t.radius.circular,
        paddingVertical: t.space.xs,
        paddingHorizontal: t.space.m,
      }}
    >
      {dot ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.color[fg] }} />
      ) : null}
      <Text variant="caption1Strong" color={fg}>
        {label}
      </Text>
    </View>
  );
}
