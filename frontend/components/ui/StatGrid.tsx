import { View } from "react-native";

import { useTheme } from "@/theme";
import { Card } from "./Card";
import { Stat, type StatProps } from "./Stat";

export function StatGrid({ items, card }: { items: StatProps[]; card?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.m }}>
      {items.map((it) => {
        const inner = <Stat {...it} />;
        return (
          <View key={it.label} style={{ width: "47%", flexGrow: 1 }}>
            {card ? <Card>{inner}</Card> : inner}
          </View>
        );
      })}
    </View>
  );
}
