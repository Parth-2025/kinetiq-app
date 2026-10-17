import { View } from "react-native";

import { type ColorToken } from "@/theme";
import { Text } from "./Text";

export type StatProps = {
  value: string;
  label: string;
  delta?: string;
  deltaTone?: "success" | "danger" | "neutral";
};

export function Stat({ value, label, delta, deltaTone = "neutral" }: StatProps) {
  const dc: ColorToken = deltaTone === "neutral" ? "textSecondary" : deltaTone;

  return (
    <View style={{ gap: 2 }}>
      <Text variant="title1">{value}</Text>
      <Text variant="caption1" color="textSecondary">
        {label}
      </Text>
      {delta ? (
        <Text variant="caption1" color={dc}>
          {delta}
        </Text>
      ) : null}
    </View>
  );
}
