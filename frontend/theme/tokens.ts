export const PALETTE = {
  ink: "#11151C",
  slate: "#212D40",
  steel: "#364156",
  rose: "#52605E",
  terracotta: "#D66853",
} as const;

export type ColorSet = {
  bg: string;
  layer: string;
  layerAlt: string;
  stroke: string;
  strokeSoft: string;
  text: string;
  textSecondary: string;
  textDisabled: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  accentSubtle: string;
  onAccent: string;
  secondary: string;
  secondarySubtle: string;
  success: string;
  successSubtle: string;
  danger: string;
  dangerSubtle: string;
  info: string;
  infoSubtle: string;
  overlay: string;
};

export type ColorToken = keyof ColorSet;

const DARK: ColorSet = {
  bg: "#11151C",
  layer: "#212D40",
  layerAlt: "#1A2231",
  stroke: "#364156",
  strokeSoft: "#2A3444",
  text: "#F3F5F8",
  textSecondary: "#9FB0C3",
  textDisabled: "#5C6B7E",
  accent: "#D66853",
  accentHover: "#E07C69",
  accentPressed: "#BF5745",
  accentSubtle: "#313A35",
  onAccent: "#FFFFFF",
  secondary: "#52605E",
  secondarySubtle: "#26332D",
  success: "#3FB984",
  successSubtle: "#16241F",
  danger: "#E5686D",
  dangerSubtle: "#2A1B1C",
  info: "#5B9BD5",
  infoSubtle: "#1B2733",
  overlay: "rgba(9,12,17,0.6)",
};

const LIGHT: ColorSet = {
  bg: "#E7E3D9",
  layer: "#EFECE4",
  layerAlt: "#DDDCD3",
  stroke: "#AFB3AC",
  strokeSoft: "#DDDCD3",
  text: "#192A2E",
  textSecondary: "#52605E",
  textDisabled: "#A6B0BB",
  accent: "#943F2D",
  accentHover: "#823726",
  accentPressed: "#743223",
  accentSubtle: "#DDD3C7",
  onAccent: "#EFECE4",
  secondary: "#52605E",
  secondarySubtle: "#D9DDD4",
  success: "#3F6A52",
  successSubtle: "#D9DFD2",
  danger: "#943F2D",
  dangerSubtle: "#E4D8CB",
  info: "#385E68",
  infoSubtle: "#D8DEDA",
  overlay: "rgba(17,21,28,0.35)",
};

export function makeColors(mode: "dark" | "light"): ColorSet {
  return mode === "dark" ? DARK : LIGHT;
}
