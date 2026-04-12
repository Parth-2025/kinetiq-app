import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ACCENT_SURFACE_ALT,
  APP_BG,
  APP_BORDER,
  APP_SHADOW,
  APP_SURFACE,
  APP_TEXT,
  APP_TEXT_MUTED,
  PURPLE,
  PURPLE_DARK,
  WHITE,
} from "@/constants/colors";
import { useAuth } from "@/context/auth-context";
import { useDatabaseLiveValue } from "@/hooks/use-database";
import {
  BASKETBALL_LEADERBOARD_KEY,
  getSampleLeaderboardStats,
  SAMPLE_LEADERBOARD_PLAYERS,
  seedSampleBasketballLeaderboard,
} from "@/services/leaderboard";
import type { StoredLeaderboardSportStats } from "@/types/analysis";
import { formatUserId } from "@/utils/user";

type LeaderboardTabKey = "overall" | "videos" | "improved";

type UserLeaderboardNode = {
  profile?: {
    username?: string;
    displayName?: string;
  };
  leaderboards?: Record<string, StoredLeaderboardSportStats | undefined>;
};

type LeaderboardEntry = {
  userId: string;
  username: string;
  displayName: string;
  stats: StoredLeaderboardSportStats;
  rank: number;
  isCurrentUser: boolean;
};

const TABS: { key: LeaderboardTabKey; label: string }[] = [
  { key: "overall", label: "Overall Score" },
  { key: "videos", label: "Videos Uploaded" },
  { key: "improved", label: "Most Improved" },
];

function getInitials(value: string) {
  const cleaned = value.trim();

  if (!cleaned) {
    return "RR";
  }

  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getMetricValue(stats: StoredLeaderboardSportStats, tab: LeaderboardTabKey) {
  if (tab === "videos") {
    return stats.num_videos;
  }

  if (tab === "improved") {
    return stats.most_improved;
  }

  return stats.max_score;
}

function compareEntries(
  a: LeaderboardEntry,
  b: LeaderboardEntry,
  tab: LeaderboardTabKey,
) {
  const scoreDelta = getMetricValue(b.stats, tab) - getMetricValue(a.stats, tab);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const maxScoreDelta = b.stats.max_score - a.stats.max_score;
  if (maxScoreDelta !== 0) {
    return maxScoreDelta;
  }

  return a.username.localeCompare(b.username);
}

function formatMetric(stats: StoredLeaderboardSportStats, tab: LeaderboardTabKey) {
  if (tab === "videos") {
    const count = stats.num_videos;
    return `${count} ${count === 1 ? "video" : "videos"}`;
  }

  if (tab === "improved") {
    return `+${stats.most_improved} pts`;
  }

  return `${stats.max_score} pts`;
}

function getRankAccent(rank: number) {
  if (rank === 1) {
    return "#F5B91F";
  }

  if (rank === 2) {
    return "#97A3B6";
  }

  if (rank === 3) {
    return "#D97706";
  }

  return PURPLE;
}

function getRankIcon(rank: number) {
  if (rank <= 3) {
    return "emoji-events";
  }

  return "military-tech";
}

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const currentUserId = formatUserId(user?.sub);
  const [activeTab, setActiveTab] = useState<LeaderboardTabKey>("overall");
  const hasSeededSamples = useRef(false);

  const { value: users, isLoading } =
    useDatabaseLiveValue<Record<string, UserLeaderboardNode>>("users");

  useEffect(() => {
    if (isLoading || !users || hasSeededSamples.current) {
      return;
    }

    const hasUsersMissingLeaderboard = Object.values(users).some((node) => {
      const username = node.profile?.username?.trim();
      const stats = node.leaderboards?.[BASKETBALL_LEADERBOARD_KEY];

      return Boolean(username) && !stats;
    });

    if (!hasUsersMissingLeaderboard) {
      hasSeededSamples.current = true;
      return;
    }

    hasSeededSamples.current = true;
    seedSampleBasketballLeaderboard({ users }).catch(() => {
      hasSeededSamples.current = false;
    });
  }, [isLoading, users]);

  const entries = useMemo(
    () => {
      const realEntries = Object.entries(users ?? {})
        .map(([userId, node]) => {
          const stats = node?.leaderboards?.[BASKETBALL_LEADERBOARD_KEY];

          if (!stats) {
            return null;
          }

          const username = node.profile?.username?.trim() || "player";
          const displayName = node.profile?.displayName?.trim() || username;

          return {
            userId,
            username,
            displayName,
            stats,
            rank: 0,
            isCurrentUser: userId === currentUserId,
          } satisfies LeaderboardEntry;
        })
        .filter((entry): entry is LeaderboardEntry => Boolean(entry));

      const occupiedUserIds = new Set(realEntries.map((entry) => entry.userId));
      const occupiedUsernames = new Set(realEntries.map((entry) => entry.username));

      const sampleEntries = SAMPLE_LEADERBOARD_PLAYERS
        .filter(
          (player) =>
            !occupiedUserIds.has(player.id) && !occupiedUsernames.has(player.username),
        )
        .map((player) => ({
          userId: player.id,
          username: player.username,
          displayName: player.displayName,
          stats: getSampleLeaderboardStats(`${player.id}:${player.username}`),
          rank: 0,
          isCurrentUser: false,
        }) satisfies LeaderboardEntry);

      return [...realEntries, ...sampleEntries]
        .sort((a, b) => compareEntries(a, b, activeTab))
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));
    },
    [activeTab, currentUserId, users],
  );

  const currentUserEntry = entries.find((entry) => entry.isCurrentUser) ?? null;
  const topEntries = entries.slice(0, 12);
  const currentSummaryLabel = currentUserEntry
    ? formatMetric(currentUserEntry.stats, activeTab)
    : "No score yet";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroGlowTop} />
          <View style={styles.heroGlowBottom} />
          <View style={styles.heroTitleRow}>
            <MaterialIcons name="emoji-events" size={36} color="#FFD54F" />
            <Text style={styles.heroTitle}>Leaderboard</Text>
          </View>
          <View style={styles.heroSportRow}>
            <Text style={styles.heroSportEmoji}>🏀</Text>
            <Text style={styles.heroSportText}>Basketball</Text>
          </View>
        </View>

        <View style={styles.boardCard}>
          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab;

              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.tabItem}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                  {isActive ? <View style={styles.tabUnderline} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {currentUserEntry ? (
            <View style={styles.summaryBand}>
              <View>
                <Text style={styles.summaryEyebrow}>Your Rank</Text>
                <Text style={styles.summaryRank}>#{currentUserEntry.rank}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRight}>
                <Text style={styles.summaryEyebrow}>Current Metric</Text>
                <Text style={styles.summaryMetric}>{currentSummaryLabel}</Text>
              </View>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={PURPLE} />
              <Text style={styles.centerStateText}>Loading leaderboard...</Text>
            </View>
          ) : topEntries.length === 0 ? (
            <View style={styles.centerState}>
              <MaterialIcons name="query-stats" size={36} color={PURPLE} />
              <Text style={styles.emptyTitle}>No leaderboard data yet</Text>
              <Text style={styles.centerStateText}>
                Upload a basketball analysis to start ranking players.
              </Text>
            </View>
          ) : (
            <View style={styles.rows}>
              {topEntries.map((entry, index) => {
                const rankColor = getRankAccent(entry.rank);
                const medalIcon = getRankIcon(entry.rank);

                return (
                  <View
                    key={entry.userId}
                    style={[
                      styles.row,
                      index < topEntries.length - 1 && styles.rowBorder,
                      entry.isCurrentUser && styles.currentUserRow,
                    ]}
                  >
                    <View style={styles.rankSlot}>
                      {entry.rank <= 3 ? (
                        <MaterialIcons
                          name={medalIcon}
                          size={26}
                          color={rankColor}
                        />
                      ) : (
                        <Text style={styles.rankNumber}>{entry.rank}</Text>
                      )}
                    </View>

                    <View style={[styles.avatar, { backgroundColor: rankColor }]}>
                      <Text style={styles.avatarText}>
                        {getInitials(entry.username)}
                      </Text>
                    </View>

                    <View style={styles.rowMeta}>
                      <Text style={styles.usernameText}>@{entry.username}</Text>
                      <Text style={styles.metricText}>
                        {formatMetric(entry.stats, activeTab)}
                      </Text>
                    </View>

                    {entry.isCurrentUser ? (
                      <View style={styles.youPill}>
                        <Text style={styles.youPillText}>You</Text>
                      </View>
                    ) : (
                      <Text style={styles.displayNameText} numberOfLines={1}>
                        {entry.displayName}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_BG,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 28,
  },
  hero: {
    backgroundColor: PURPLE,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 132,
    overflow: "hidden",
  },
  heroGlowTop: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroGlowBottom: {
    position: "absolute",
    bottom: -90,
    left: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: PURPLE_DARK,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroTitle: {
    color: WHITE,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  heroSportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  heroSportEmoji: {
    fontSize: 20,
  },
  heroSportText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 17,
    fontWeight: "600",
  },
  boardCard: {
    marginTop: -78,
    marginHorizontal: 16,
    backgroundColor: APP_SURFACE,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: APP_BORDER,
    backgroundColor: APP_SURFACE,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 62,
    paddingHorizontal: 8,
    paddingTop: 18,
  },
  tabLabel: {
    color: APP_TEXT_MUTED,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  tabLabelActive: {
    color: PURPLE,
  },
  tabUnderline: {
    marginTop: 14,
    height: 3,
    alignSelf: "stretch",
    borderRadius: 999,
    backgroundColor: PURPLE,
  },
  summaryBand: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: ACCENT_SURFACE_ALT,
  },
  summaryEyebrow: {
    color: APP_TEXT_MUTED,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  summaryRank: {
    marginTop: 3,
    color: APP_TEXT,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  summaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: APP_BORDER,
    marginHorizontal: 16,
  },
  summaryRight: {
    flex: 1,
  },
  summaryMetric: {
    marginTop: 3,
    color: APP_TEXT,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  centerStateText: {
    color: APP_TEXT_MUTED,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 21,
  },
  emptyTitle: {
    color: APP_TEXT,
    fontSize: 19,
    fontWeight: "800",
  },
  rows: {
    backgroundColor: APP_SURFACE,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: APP_BORDER,
  },
  currentUserRow: {
    backgroundColor: "#EDF1FF",
  },
  rankSlot: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  rankNumber: {
    color: "#8B93A7",
    fontSize: 16,
    fontWeight: "700",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
  },
  usernameText: {
    color: APP_TEXT,
    fontSize: 15,
    fontWeight: "800",
  },
  metricText: {
    marginTop: 3,
    color: APP_TEXT_MUTED,
    fontSize: 14,
    fontWeight: "600",
  },
  displayNameText: {
    maxWidth: 88,
    color: APP_TEXT_MUTED,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },
  youPill: {
    backgroundColor: PURPLE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  youPillText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "800",
  },
});
