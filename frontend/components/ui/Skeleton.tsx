import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

type Props = { width: number | `${number}%`; height: number; radius?: number };

export function Skeleton({ width, height, radius }: Props) {
  const t = useTheme();
  const o = useSharedValue(0.4);

  useEffect(() => {
    o.value = withRepeat(
      withSequence(withTiming(0.8, { duration: 600 }), withTiming(0.4, { duration: 600 })),
      -1,
      true,
    );
  }, [o]);

  const style = useAnimatedStyle(() => ({ opacity: o.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius ?? t.radius.m, backgroundColor: t.color.layerAlt },
        style,
      ]}
    />
  );
}
