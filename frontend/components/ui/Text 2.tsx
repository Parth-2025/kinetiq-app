import type { ReactNode } from "react";
import { Text as RNText, type StyleProp, type TextStyle } from "react-native";

import { useTheme, type ColorToken, type TypeVariant } from "@/theme";

type Props = {
  children: ReactNode;
  variant?: TypeVariant;
  color?: ColorToken;
  weight?: TextStyle["fontWeight"];
  numberOfLines?: number;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
};

export function Text({
  children,
  variant = "body1",
  color = "text",
  weight,
  numberOfLines,
  align,
  style,
}: Props) {
  const t = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        t.type[variant],
        { color: t.color[color], fontFamily: t.fonts.sans },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
