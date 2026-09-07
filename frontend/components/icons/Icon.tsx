import { useTheme, type ColorToken } from "@/theme";

import { ICONS, type IconName } from "./registry";

export function Icon({
  name,
  size = 20,
  color = "text",
  hex,
}: {
  name: IconName;
  size?: number;
  color?: ColorToken;
  hex?: string;
}) {
  const t = useTheme();
  const Cmp = ICONS[name];
  return <Cmp size={size} color={hex ?? t.color[color]} />;
}
