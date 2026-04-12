import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          {/* Public screen — no auth guard */}
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/username" options={{ headerShown: false }} />

          {/* Protected screens wrapped in the auth guard */}
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="messages/[friendId]" options={{ headerShown: false }} />
          <Stack.Screen name="messages/new" options={{ headerShown: false }} />
          <Stack.Screen name="friends/add" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="sports" options={{ headerShown: false }} />
          <Stack.Screen name="shot-breakdown" options={{ headerShown: false }} />
          <Stack.Screen name="phase-detail" options={{ headerShown: false }} />
          <Stack.Screen name="player-stats" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
