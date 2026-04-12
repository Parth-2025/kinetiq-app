import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";

import { useAuth } from "@/context/auth-context";

/**
 * Auth0 redirects here after login and logout.
 *
 * - Login:  ?code= is present — delegate the token exchange to completeWebLogin
 *           (which updates the AuthProvider state directly), then navigate home.
 * - Logout / no code: render <Redirect> immediately so expo-router handles
 *           the navigation timing instead of an imperative call.
 */
export default function AuthCallback() {
  const router = useRouter();
  const { completeWebLogin, setAuthErrorMessage } = useAuth();
  const [done, setDone] = useState(false);
  const params =
    Platform.OS === "web"
      ? new URLSearchParams(window.location.search)
      : null;

  const code = params?.get("code") ?? null;
  const state = params?.get("state") ?? null;
  const error = params?.get("error") ?? null;
  const errorDescription = params?.get("error_description") ?? null;

  useEffect(() => {
    if (error) {
      setAuthErrorMessage(error, errorDescription);
      setDone(true);
      return;
    }

    if (!code) return;

    completeWebLogin(code, state)
      .then(() => router.replace("/"))
      .catch((authError: unknown) => {
        const message =
          authError instanceof Error ? authError.message : "login_failed";
        setAuthErrorMessage("access_denied", message);
        setDone(true);
      });
  }, [
    code,
    completeWebLogin,
    error,
    errorDescription,
    router,
    setAuthErrorMessage,
    state,
  ]);

  if (!code || done) {
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0a7ea4" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
