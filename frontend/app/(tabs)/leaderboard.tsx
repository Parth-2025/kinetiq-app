import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
  SUCCESS,
  WHITE,
} from "@/constants/colors";
import { useAuth } from "@/context/auth-context";
import { useDatabaseLiveValue } from "@/hooks/use-database";
import { useSocialInbox } from "@/hooks/use-social-inbox";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  BASKETBALL_LEADERBOARD_KEY,
  getSampleLeaderboardStats,
  getSportLeaderboardPath,
  normalizeLeaderboardStats,
  SAMPLE_LEADERBOARD_PLAYERS,
  sanitizeBasketballLeaderboardStats,
  seedSampleBasketballLeaderboard,
} from "@/services/leaderboard";
import type { StoredLeaderboardSportStats } from "@/types/analysis";
import type { SocialFriend } from "@/types/social";
import { addFriendToInbox } from "@/utils/social";
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

const SAMPLE_PLAYERS_BY_ID = new Map(
  SAMPLE_LEADERBOARD_PLAYERS.map((player) => [player.id, player] as const),
);

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
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const hasSeededSamples = useRef(false);
  const { profile } = useUserProfile(user?.sub);
  const { inbox, saveInbox, isSaving } = useSocialInbox(user?.sub, profile?.username);
  const { value: currentUserLeaderboardStats } =
    useDatabaseLiveValue<StoredLeaderboardSportStats>(
      getSportLeaderboardPath(currentUserId, BASKETBALL_LEADERBOARD_KEY),
    );

  const { value: users, isLoading } =
    useDatabaseLiveValue<Record<string, UserLeaderboardNode>>("users");

  useEffect(() => {
    if (isLoading || !users || hasSeededSamples.current) {
      return;
    }

    const hasUsersMissingLeaderboard = Object.entries(users).some(([userId, node]) => {
      if (userId === currentUserId) {
        return false;
      }

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
  }, [currentUserId, isLoading, users]);

  useEffect(() => {
    if (isLoading || !users) {
      return;
    }

    sanitizeBasketballLeaderboardStats({ users }).catch(() => {
      // Ignore sanitation failures and keep rendering the normalized view.
    });
  }, [isLoading, users]);

  const entries = useMemo(
    () => {
      const realEntries = Object.entries(users ?? {})
        .map(([userId, node]) => {
          if (userId === currentUserId) {
            return null;
          }

          const samplePlayer = SAMPLE_PLAYERS_BY_ID.get(userId);
          const stats = samplePlayer
            ? getSampleLeaderboardStats(`${samplePlayer.id}:${samplePlayer.username}`)
            : normalizeLeaderboardStats(
                node?.leaderboards?.[BASKETBALL_LEADERBOARD_KEY],
              );

          if (!stats) {
            return null;
          }

          const username =
            samplePlayer?.username ?? node.profile?.username?.trim() ?? "player";
          const displayName =
            samplePlayer?.displayName ??
            node.profile?.displayName?.trim() ??
            username;

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

      const currentUserEntry =
        profile?.username?.trim() && currentUserLeaderboardStats
          ? ({
              userId: currentUserId,
              username: profile.username.trim(),
              displayName: profile.displayName?.trim() || profile.username.trim(),
              stats: normalizeLeaderboardStats(currentUserLeaderboardStats),
              rank: 0,
              isCurrentUser: true,
            } satisfies LeaderboardEntry)
          : null;

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

      return [...realEntries, ...(currentUserEntry?.stats ? [currentUserEntry] : []), ...sampleEntries]
        .sort((a, b) => compareEntries(a, b, activeTab))
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));
    },
    [activeTab, currentUserId, currentUserLeaderboardStats, profile, users],
  );

  const currentUserEntry = entries.find((entry) => entry.isCurrentUser) ?? null;
  const topEntries = entries.slice(0, 12);
  const currentSummaryLabel = currentUserEntry
    ? formatMetric(currentUserEntry.stats, activeTab)
    : "No score yet";
  const socialProfile = selectedEntry
    ? inbox.friends.find((friend) => friend.id === selectedEntry.userId) ??
      inbox.suggestions.find((friend) => friend.id === selectedEntry.userId) ??
      null
    : null;
  const isAlreadyFriend = selectedEntry
    ? inbox.friends.some((friend) => friend.id === selectedEntry.userId)
    : false;

  function buildFriend(entry: LeaderboardEntry): SocialFriend {
    if (socialProfile) {
      return socialProfile;
    }

    return {
      id: entry.userId,
      username: entry.username,
      sport: "Basketball",
      level: Math.max(1, Math.round(entry.stats.max_score / 7)),
      isOnline: false,
      status: `${entry.displayName} is climbing the basketball leaderboard.`,
    };
  }

  async function handleAddFriend() {
    if (!selectedEntry || selectedEntry.isCurrentUser || isAlreadyFriend) {
      return;
    }

    setFeedback(null);

    try {
      const nextInbox = addFriendToInbox(inbox, buildFriend(selectedEntry));
      await saveInbox(nextInbox);
      setFeedback(`@${selectedEntry.username} added to your friends.`);
    } catch {
      setFeedback("We could not add that user right now.");
    }
  }

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
                  <Pressable
                    key={entry.userId}
                    onPress={() => {
                      setFeedback(null);
                      setSelectedEntry(entry);
                    }}
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
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedEntry)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <Pressable style={styles.modalScrim} onPress={() => setSelectedEntry(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {selectedEntry ? (
              <>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <View
                    style={[
                      styles.modalAvatar,
                      { backgroundColor: getRankAccent(selectedEntry.rank) },
                    ]}
                  >
                    <Text style={styles.modalAvatarText}>
                      {getInitials(selectedEntry.username)}
                    </Text>
                  </View>

                  <View style={styles.modalHeaderCopy}>
                    <Text style={styles.modalTitle}>{selectedEntry.displayName}</Text>
                    <Text style={styles.modalSubtitle}>@{selectedEntry.username}</Text>
                  </View>
                </View>

                <View style={styles.modalStatsRow}>
                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Rank</Text>
                    <Text style={styles.modalStatValue}>#{selectedEntry.rank}</Text>
                  </View>
                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Best Score</Text>
                    <Text style={styles.modalStatValue}>{selectedEntry.stats.max_score}</Text>
                  </View>
                </View>

                <View style={styles.modalStatsRow}>
                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Videos</Text>
                    <Text style={styles.modalStatValue}>{selectedEntry.stats.num_videos}</Text>
                  </View>
                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Most Improved</Text>
                    <Text style={styles.modalStatValue}>
                      +{selectedEntry.stats.most_improved}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalInfoCard}>
                  <Text style={styles.modalInfoLabel}>About</Text>
                  <Text style={styles.modalInfoText}>
                    {socialProfile?.status ??
                      `${selectedEntry.displayName} is competing in basketball drills and leaderboard sessions.`}
                  </Text>
                  <Text style={styles.modalInfoMeta}>
                    Basketball · Level {socialProfile?.level ?? Math.max(1, Math.round(selectedEntry.stats.max_score / 7))}
                  </Text>
                </View>

                {feedback ? (
                  <Text
                    style={[
                      styles.modalFeedback,
                      feedback.includes("added") && styles.modalFeedbackSuccess,
                    ]}
                  >
                    {feedback}
                  </Text>
                ) : null}

                {selectedEntry.isCurrentUser ? (
                  <View style={styles.modalStatusPill}>
                    <Text style={styles.modalStatusPillText}>This is you</Text>
                  </View>
                ) : isAlreadyFriend ? (
                  <View style={[styles.modalStatusPill, styles.modalStatusPillSuccess]}>
                    <Text
                      style={[
                        styles.modalStatusPillText,
                        styles.modalStatusPillTextSuccess,
                      ]}
                    >
                      Already in your friends
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.modalAddButton, isSaving && styles.modalAddButtonDisabled]}
                    onPress={handleAddFriend}
                    disabled={isSaving}
                  >
                    <Text style={styles.modalAddButtonText}>
                      {isSaving ? "Adding..." : "Add User"}
                    </Text>
                  </Pressable>
                )}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
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
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
    padding: 16,
  },
  modalCard: {
    borderRadius: 28,
    backgroundColor: APP_SURFACE,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: APP_BORDER,
    marginBottom: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  modalAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  modalAvatarText: {
    color: WHITE,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  modalHeaderCopy: {
    flex: 1,
  },
  modalTitle: {
    color: APP_TEXT,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  modalSubtitle: {
    marginTop: 4,
    color: APP_TEXT_MUTED,
    fontSize: 15,
    fontWeight: "600",
  },
  modalStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  modalStatCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: ACCENT_SURFACE_ALT,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  modalStatLabel: {
    color: APP_TEXT_MUTED,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  modalStatValue: {
    marginTop: 6,
    color: APP_TEXT,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  modalInfoCard: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: APP_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  modalInfoLabel: {
    color: APP_TEXT_MUTED,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  modalInfoText: {
    color: APP_TEXT,
    fontSize: 15,
    lineHeight: 22,
  },
  modalInfoMeta: {
    color: APP_TEXT_MUTED,
    fontSize: 14,
    fontWeight: "600",
  },
  modalFeedback: {
    marginTop: 14,
    color: "#B42318",
    fontSize: 13,
    fontWeight: "700",
  },
  modalFeedbackSuccess: {
    color: SUCCESS,
  },
  modalStatusPill: {
    marginTop: 18,
    borderRadius: 999,
    backgroundColor: ACCENT_SURFACE_ALT,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalStatusPillSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.14)",
  },
  modalStatusPillText: {
    color: APP_TEXT,
    fontSize: 14,
    fontWeight: "700",
  },
  modalStatusPillTextSuccess: {
    color: SUCCESS,
  },
  modalAddButton: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: PURPLE,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  modalAddButtonDisabled: {
    opacity: 0.7,
  },
  modalAddButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
});
