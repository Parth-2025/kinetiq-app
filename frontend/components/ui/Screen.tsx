import type { ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

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
        <View style={[{ flex: 1 }, padStyle, contentStyle]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}
