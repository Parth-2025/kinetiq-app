import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import "react-native-reanimated";

import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider, useTheme } from "@/theme";

function ThemedStack() {
  const t = useTheme();
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => listener.remove();
  }, []);
  return (
    <NavigationThemeProvider
      value={t.mode === "dark" ? DarkTheme : DefaultTheme}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.color.bg },
          animation: reduceMotion ? "none" : "slide_from_right",
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen
          name="auth/callback"
          options={{ animation: reduceMotion ? "none" : "fade" }}
        />
        <Stack.Screen name="onboarding/username" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="coach" />
        <Stack.Screen name="messages/[friendId]" />
        <Stack.Screen name="messages/new" />
        <Stack.Screen name="friends/add" />
        <Stack.Screen name="sports" />
        <Stack.Screen name="shot-breakdown" />
        <Stack.Screen name="phase-detail" />
        <Stack.Screen name="player-stats" />
      </Stack>
      <StatusBar style={t.mode === "dark" ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ThemedStack />
      </ThemeProvider>
    </AuthProvider>
  );
}
