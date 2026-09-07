import { ActivityIndicator, Pressable, type ViewStyle } from "react-native";

import { useTheme, type ColorToken } from "@/theme";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { Text } from "./Text";

type Props = {
  label: string;
  onPress: () => void;
  appearance?: "primary" | "secondary" | "subtle" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  onPress,
  appearance = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  fullWidth,
}: Props) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    appearance === "primary"
      ? t.color.accent
      : appearance === "secondary"
        ? t.color.secondary
        : "transparent";
  const fg: ColorToken =
    appearance === "primary" || appearance === "secondary"
      ? "onAccent"
      : appearance === "subtle"
        ? "accent"
        : "text";
  const border: ViewStyle =
    appearance === "outline" ? { borderWidth: 1, borderColor: t.color.stroke } : {};

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: t.size[size],
          borderRadius: t.radius.l,
          paddingHorizontal: t.space.l,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: t.space.s,
          backgroundColor: bg,
          alignSelf: fullWidth ? "stretch" : undefined,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        border,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.color[fg]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text variant="body1Strong" color={fg}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
