import type { ViewStyle } from "react-native";

// Flat surfaces throughout the shared UI. Borders provide separation.
const flat: ViewStyle = {
  shadowColor: "transparent",
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
};
export const ELEVATION = {
  shadow2: flat,
  shadow4: flat,
  shadow8: flat,
  shadow16: flat,
};
