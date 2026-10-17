import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { Text } from "./Text";

type Props = {
  title: string;
  subtitle?: string;
  leading?: IconName | ReactNode;
  trailing?: "chevron" | ReactNode;
  onPress?: () => void;
  divider?: boolean;
};

export function ListItem({ title, subtitle, leading, trailing, onPress, divider }: Props) {
  const t = useTheme();

  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.m,
        minHeight: 56,
        paddingVertical: t.space.m,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: t.color.stroke,
      }}
    >
      {typeof leading === "string" ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: t.color.accentSubtle,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={leading as IconName} size={20} color="accent" />
        </View>
      ) : (
        (leading as ReactNode) ?? null
      )}
      <View style={{ flex: 1 }}>
        <Text variant="body1Strong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption1" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing === "chevron" ? (
        <Icon name="chevron-right" size={20} color="textSecondary" />
      ) : (
        (trailing as ReactNode) ?? null
      )}
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}>
      {body}
    </Pressable>
  ) : (
    body
  );
}
