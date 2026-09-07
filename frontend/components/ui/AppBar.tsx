import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import { Text } from "./Text";

type Props = { title: string; onBack?: () => void; trailing?: ReactNode };

export function AppBar({ title, onBack, trailing }: Props) {
  const t = useTheme();
  return (
    <View
      style={{
        height: 52,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: t.space.s,
        backgroundColor: t.color.bg,
        borderBottomWidth: 1,
        borderBottomColor: t.color.stroke,
      }}
    >
      <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="chevron-left" size={24} color="text" />
          </Pressable>
        ) : null}
      </View>
      <Text variant="title3" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{trailing}</View>
    </View>
  );
}
