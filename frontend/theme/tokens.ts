export const PALETTE = {
  ink: "#11151C",
  slate: "#212D40",
  steel: "#364156",
  rose: "#7D4E57",
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
  accentSubtle: "#2A2028",
  onAccent: "#FFFFFF",
  secondary: "#7D4E57",
  secondarySubtle: "#241D20",
  success: "#3FB984",
  successSubtle: "#16241F",
  danger: "#E5686D",
  dangerSubtle: "#2A1B1C",
  overlay: "rgba(9,12,17,0.6)",
};

const LIGHT: ColorSet = {
  bg: "#F5F6F8",
  layer: "#FFFFFF",
  layerAlt: "#EEF1F4",
  stroke: "#E1E5EA",
  strokeSoft: "#EEF1F4",
  text: "#11151C",
  textSecondary: "#5A6B7D",
  textDisabled: "#A6B0BB",
  accent: "#D66853",
  accentHover: "#C25642",
  accentPressed: "#AC4A38",
  accentSubtle: "#FBEEEA",
  onAccent: "#FFFFFF",
  secondary: "#7D4E57",
  secondarySubtle: "#F6EEF0",
  success: "#1F9D6B",
  successSubtle: "#E7F6EF",
  danger: "#D64550",
  dangerSubtle: "#FBEBEC",
  overlay: "rgba(17,21,28,0.35)",
};

export function makeColors(mode: "dark" | "light"): ColorSet {
  return mode === "dark" ? DARK : LIGHT;
}
