import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme, type SpaceKey } from "@/theme";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  pad?: SpaceKey;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, onPress, pad = "l", style }: Props) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.color.layer,
    borderRadius: t.radius.xl,
    padding: t.space[pad],
    ...(t.mode === "light"
      ? t.elevation.shadow4
      : { borderWidth: 1, borderColor: t.color.stroke }),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed ? { opacity: 0.92, transform: [{ scale: 0.99 }] } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
