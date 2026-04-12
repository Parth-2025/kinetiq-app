import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AUTH_BG,
  AUTH_CARD,
  AUTH_MUTED,
  AUTH_SUBTLE,
  AUTH_TEXT,
  PURPLE,
  TEAL,
  WHITE_15,
} from "@/constants/colors";
import { useAuth } from "@/context/auth-context";

export default function LoginScreen() {
  const { user, isLoading, authError, login, signUp, clearAuthError } =
    useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user, router]);

  useEffect(() => {
    if (!authError) {
      return;
    }

    return () => {
      clearAuthError();
    };
  }, [authError, clearAuthError]);

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Brand ── */}
      <View style={styles.brandSection}>
        <Text style={styles.appName}>KinetiQ</Text>

        <Image
          source={require("@/assets/images/sky-blue-logo.png")}
          style={styles.icon}
          contentFit="contain"
        />

        <Text style={styles.tagline}>Analyze. Align. Achieve.</Text>
      </View>

      {/* ── Actions ── */}
      <View style={styles.actionsSection}>
        {authError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Verification required</Text>
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <ActivityIndicator size="large" color={TEAL} style={styles.loader} />
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                pressed && styles.btnPressed,
              ]}
              onPress={login}
              accessibilityRole="button"
              accessibilityLabel="Log in to your account"
            >
              <Text style={styles.btnSecondaryText}>Log In</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                pressed && styles.btnPressed,
              ]}
              onPress={signUp}
              accessibilityRole="button"
              accessibilityLabel="Create a new account"
            >
              <Text style={styles.btnSecondaryText}>Create Account</Text>
            </Pressable>

            <View style={styles.orRow}>
              <View style={styles.divider} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.divider} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                pressed && styles.btnPressed,
              ]}
              onPress={login}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* ── Footer ── */}
      <Text style={styles.footer}>
        By continuing, you agree to our{" "}
        <Text style={styles.footerLink}>Terms of Service</Text> and{" "}
        <Text style={styles.footerLink}>Privacy Policy</Text>.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH_BG,
    paddingHorizontal: 28,
    justifyContent: "space-between",
    paddingBottom: 28,
  },

  // Brand
  brandSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: AUTH_TEXT,
    letterSpacing: -0.5,
  },
  icon: {
    width: 240,
    height: 240,
    marginLeft: 35,
  },
  tagline: {
    fontSize: 15,
    color: AUTH_SUBTLE,
    textAlign: "center",
    lineHeight: 22,
  },
  signupHint: {
    fontSize: 13,
    color: AUTH_MUTED,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 260,
  },

  // Actions
  actionsSection: {
    gap: 12,
    marginBottom: 20,
  },
  loader: {
    marginVertical: 24,
  },
  errorCard: {
    backgroundColor: "rgba(180, 64, 64, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 120, 120, 0.28)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  errorTitle: {
    color: AUTH_TEXT,
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    color: AUTH_SUBTLE,
    fontSize: 13,
    lineHeight: 18,
  },
  btn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: AUTH_CARD,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  btnPrimaryText: {
    color: PURPLE,
    fontSize: 16,
    fontWeight: "700",
  },
  btnSecondaryText: {
    color: AUTH_TEXT,
    fontSize: 16,
    fontWeight: "500",
  },

  // Or divider
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: WHITE_15,
  },
  orText: {
    color: AUTH_MUTED,
    fontSize: 13,
  },

  // Google
  googleG: {
    fontSize: 16,
    fontWeight: "800",
    color: AUTH_TEXT,
  },
  googleText: {
    color: AUTH_TEXT,
    fontSize: 16,
    fontWeight: "600",
  },

  // Footer
  footer: {
    fontSize: 12,
    color: AUTH_MUTED,
    textAlign: "center",
    lineHeight: 18,
  },
  footerLink: {
    color: AUTH_SUBTLE,
    textDecorationLine: "underline",
  },
});
