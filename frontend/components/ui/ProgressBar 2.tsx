import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

export function ProgressBar({ value, height = 8 }: { value: number; height?: number }) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const w = useSharedValue(0);

  useEffect(() => {
    w.value = withTiming(clamped, { duration: t.motion.durationNormal });
  }, [clamped, w, t.motion.durationNormal]);

  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View
      style={{
        height,
        borderRadius: t.radius.circular,
        backgroundColor: t.color.layerAlt,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          { height: "100%", borderRadius: t.radius.circular, backgroundColor: t.color.accent },
          fill,
        ]}
      />
    </View>
  );
}
