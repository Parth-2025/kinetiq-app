import { Pressable, View } from "react-native";

import { useTheme, type ColorToken } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { Text } from "./Text";

type Tone = "info" | "success" | "danger";

const TONE_ICON: Record<Tone, IconName> = {
  info: "info",
  success: "checkmark-circle",
  danger: "warning",
};

type Props = {
  tone: Tone;
  title?: string;
  message: string;
  onDismiss?: () => void;
  action?: { label: string; onPress: () => void };
};

export function InlineAlert({ tone, title, message, onDismiss, action }: Props) {
  const t = useTheme();
  const subtle: ColorToken = `${tone}Subtle` as ColorToken;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: t.space.s,
        backgroundColor: t.color[subtle],
        borderLeftWidth: 3,
        borderLeftColor: t.color[tone],
        borderRadius: t.radius.m,
        padding: t.space.m,
      }}
    >
      <Icon name={TONE_ICON[tone]} size={18} color={tone} />
      <View style={{ flex: 1, gap: t.space.xs }}>
        {title ? (
          <Text variant="body1Strong" color={tone}>
            {title}
          </Text>
        ) : null}
        <Text variant="caption1" color="text">
          {message}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text variant="caption1Strong" color={tone}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Icon name="dismiss" size={16} color="textSecondary" />
        </Pressable>
      ) : null}
    </View>
  );
}
