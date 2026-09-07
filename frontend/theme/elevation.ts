import type { ViewStyle } from "react-native";

type Shadow = Pick<
  ViewStyle,
  "shadowColor" | "shadowOpacity" | "shadowRadius" | "shadowOffset" | "elevation"
>;

export const ELEVATION = {
  shadow2: { shadowColor: "#0B1220", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  shadow4: { shadowColor: "#0B1220", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  shadow8: { shadowColor: "#0B1220", shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shadow16: { shadowColor: "#0B1220", shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16 },
} satisfies Record<string, Shadow>;
