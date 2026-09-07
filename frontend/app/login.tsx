import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/theme";

export default function LoginScreen() {
  const t = useTheme();
  const { user, isLoading, authError, login, signUp, clearAuthError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user, router]);

  useEffect(() => {
    if (!authError) return;
    return () => clearAuthError();
  }, [authError, clearAuthError]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: t.space.xl,
          justifyContent: "space-between",
          paddingBottom: t.space.xl,
        }}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.l }}>
          <Image
            source={require("@/assets/images/sky-blue-logo.png")}
            style={{ width: 180, height: 180 }}
            contentFit="contain"
          />
          <Text variant="display">KinetiQ</Text>
          <Text variant="body1" color="textSecondary" align="center">
            Analyze. Align. Achieve.
          </Text>
        </View>

        <View style={{ gap: t.space.m, alignItems: "center" }}>
          {authError ? (
            <InlineAlert tone="danger" title="Verification required" message={authError} />
          ) : null}
          {isLoading ? (
            <ActivityIndicator size="large" color={t.color.accent} style={{ marginVertical: t.space.xl }} />
          ) : (
            <>
              <Button label="Sign in" fullWidth onPress={login} />
              <Button label="Create account" appearance="subtle" fullWidth onPress={signUp} />
            </>
          )}
          <Text variant="caption1" color="textSecondary" align="center">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
