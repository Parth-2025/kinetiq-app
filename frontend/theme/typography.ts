import { Platform, type TextStyle } from "react-native";

type TypeEntry = {
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle["fontWeight"];
};

export const TYPE = {
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  caption1Strong: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  body1: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  body1Strong: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  subtitle1: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  title3: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  title2: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700" },
} satisfies Record<string, TypeEntry>;

export type TypeVariant = keyof typeof TYPE;

export const Fonts = Platform.select({
  ios: { sans: "system-ui" },
  default: { sans: "normal" },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
}) as { sans: string };
