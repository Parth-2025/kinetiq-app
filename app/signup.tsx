import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useColorScheme,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/providers/AuthProvider";

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const isDark = useColorScheme() === "dark";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert("Missing fields", "Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Signup failed", e.message ?? "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: isDark ? "#1e2224" : "#f4f6f8",
      borderColor: isDark ? "#2e3234" : "#dde1e6",
      color: isDark ? "#ECEDEE" : "#11181C",
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.brand}>
        <ThemedText style={styles.brandTitle}>RIM READY</ThemedText>
        <ThemedText style={styles.brandSub}>Your game. Your grind.</ThemedText>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: isDark ? "#1a1c1e" : "#ffffff" },
        ]}
      >
        <ThemedText type="subtitle">Create account</ThemedText>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Email</ThemedText>
          <TextInput
            placeholder="you@example.com"
            placeholderTextColor={isDark ? "#555" : "#aaa"}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
          />
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Password</ThemedText>
          <TextInput
            placeholder="Min. 6 characters"
            placeholderTextColor={isDark ? "#555" : "#aaa"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={inputStyle}
          />
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Confirm Password</ThemedText>
          <TextInput
            placeholder="Re-enter password"
            placeholderTextColor={isDark ? "#555" : "#aaa"}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            style={inputStyle}
          />
        </View>

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>Create account</ThemedText>
          )}
        </Pressable>
      </View>

      <Pressable style={styles.footerLink} onPress={() => router.back()}>
        <ThemedText style={styles.footerText}>
          Already have an account?{" "}
          <ThemedText style={styles.linkText}>Sign in</ThemedText>
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 24,
  },
  brand: {
    alignItems: "center",
    gap: 6,
  },
  brandTitle: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: 2,
    color: "#0a7ea4",
  },
  brandSub: {
    fontSize: 13,
    opacity: 0.45,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  card: {
    width: "100%",
    padding: 24,
    borderRadius: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    padding: 14,
    borderRadius: 10,
    fontSize: 15,
  },
  button: {
    marginTop: 4,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  footerLink: {
    padding: 8,
  },
  footerText: {
    fontSize: 14,
    opacity: 0.65,
  },
  linkText: {
    color: "#0a7ea4",
    fontWeight: "600",
    opacity: 1,
  },
});
