import { Easing } from "react-native-reanimated";

export const MOTION = {
  durationFast: 100,
  durationNormal: 200,
  durationSlow: 300,
  curveDecel: Easing.out(Easing.cubic),
  curveStandard: Easing.inOut(Easing.cubic),
} as const;
