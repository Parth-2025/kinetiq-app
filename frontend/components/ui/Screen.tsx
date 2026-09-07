import type { ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

/**
 * Cap the content column so the app reads as one coherent column on wide
 * (desktop web) viewports instead of stretching edge to edge. On phone-width
 * screens this is a no-op.
 */
const MAX_CONTENT_WIDTH = 480;

type Props = {
  children: ReactNode;
  scroll?: boolean;
  appBar?: ReactNode;
  pad?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll, appBar, pad = true, contentStyle }: Props) {
  const t = useTheme();
  const padStyle = pad ? { paddingHorizontal: t.space.l, paddingTop: t.space.l } : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }} edges={["top"]}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: MAX_CONTENT_WIDTH,
          alignSelf: "center",
        }}
      >
        {appBar}
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              padStyle,
              { paddingBottom: t.space.xxxl },
              contentStyle,
            ]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, padStyle, contentStyle]}>{children}</View>
        )}
      </View>
    </SafeAreaView>
  );
}
