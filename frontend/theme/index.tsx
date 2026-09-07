import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { makeColors, type ColorSet } from "./tokens";
import { TYPE, Fonts } from "./typography";
import { SPACE, SIZE } from "./spacing";
import { RADIUS } from "./radius";
import { ELEVATION } from "./elevation";
import { MOTION } from "./motion";

export type { ColorToken, ColorSet } from "./tokens";
export type { TypeVariant } from "./typography";
export type { SpaceKey } from "./spacing";

export type ThemeMode = "dark" | "light";

export type Theme = {
  mode: ThemeMode;
  color: ColorSet;
  type: typeof TYPE;
  fonts: { sans: string };
  space: typeof SPACE;
  size: typeof SIZE;
  radius: typeof RADIUS;
  elevation: typeof ELEVATION;
  motion: typeof MOTION;
  setThemeOverride: (mode: ThemeMode | null) => void;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<ThemeMode | null>(null);
  const mode: ThemeMode = override ?? (system === "dark" ? "dark" : "light");

  const value = useMemo<Theme>(
    () => ({
      mode,
      color: makeColors(mode),
      type: TYPE,
      fonts: Fonts,
      space: SPACE,
      size: SIZE,
      radius: RADIUS,
      elevation: ELEVATION,
      motion: MOTION,
      setThemeOverride: setOverride,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
