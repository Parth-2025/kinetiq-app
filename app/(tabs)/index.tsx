import React from "react";
import { Pressable, StyleSheet, View, useColorScheme } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/providers/AuthProvider";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const isDark = useColorScheme() === "dark";

  const email = user?.email ?? "";
  const displayName = email.split("@")[0] ?? "Athlete";
  const initial = displayName[0]?.toUpperCase() ?? "?";

  const cardBg = isDark ? "#1a1c1e" : "#f4f8fb";

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.greeting}>{getGreeting()},</ThemedText>
        <ThemedText type="title">{displayName}</ThemedText>
      </View>

      {/* Account card */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={styles.cardRow}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>{initial}</ThemedText>
          </View>
          <View style={styles.cardInfo}>
            <ThemedText type="defaultSemiBold">{displayName}</ThemedText>
            <ThemedText style={styles.emailText}>{email}</ThemedText>
          </View>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {[
          { value: "—", label: "Sessions" },
          { value: "—", label: "Streak" },
          { value: "—", label: "Goals" },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[styles.statCard, { backgroundColor: cardBg }]}
          >
            <ThemedText style={styles.statValue}>{stat.value}</ThemedText>
            <ThemedText style={styles.statLabel}>{stat.label}</ThemedText>
          </View>
        ))}
      </View>

      {/* Sign out */}
      <Pressable style={styles.signOut} onPress={() => signOut()}>
        <ThemedText style={styles.signOutText}>Sign out</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 20,
  },
  header: {
    marginTop: 12,
    gap: 2,
  },
  greeting: {
    fontSize: 15,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  card: {
    padding: 16,
    borderRadius: 16,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  cardInfo: {
    gap: 2,
  },
  emailText: {
    fontSize: 13,
    opacity: 0.5,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  signOut: {
    marginTop: "auto",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#e74c3c",
  },
  signOutText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
