import { View } from "react-native";

import { useTheme } from "@/theme";

export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.color.stroke, marginLeft: inset }} />;
}
