import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/auth-context";
import { useDatabaseLiveValue } from "@/hooks/use-database";
import type { AnalysisSession } from "@/types/analysis";
import {
  getPhaseKeys,
  getPhaseLabel,
  getScoreColor,
  isAnalysisPhaseKey,
  scoreToGrade,
} from "@/utils/analysis";
import { formatUserId } from "@/utils/user";

const ORANGE = "#E85D04";
const BG = "#181818";
const ROW_BG = "#242424";
const SEP = "#2E2E2E";

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const color = getScoreColor(score);

  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
      ]}
    >
      <Text style={[styles.ringText, { fontSize: size * 0.3 }]}>
        {Math.round(score)}
      </Text>
    </View>
  );
}

export default function ShotBreakdownScreen() {
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const { user } = useAuth();
  const userId = formatUserId(user?.sub);

  const requestedSessionId =
    typeof params.sessionId === "string" ? params.sessionId : null;

  const { value: activeSessionId, isLoading: isActiveSessionLoading } =
    useDatabaseLiveValue<string>(`users/${userId}/analysis/activeSessionId`);

  const resolvedSessionId = requestedSessionId ?? activeSessionId;

  const { value: session, isLoading: isSessionLoading } =
    useDatabaseLiveValue<AnalysisSession>(
      resolvedSessionId
        ? `users/${userId}/analysisSessions/${resolvedSessionId}`
        : null,
    );

  const isLoading = isActiveSessionLoading || isSessionLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={styles.centerStateText}>Loading saved analysis...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <MaterialIcons name="query-stats" size={42} color={ORANGE} />
          <Text style={styles.centerStateTitle}>No analysis session found</Text>
          <Text style={styles.centerStateText}>
            Upload a shot video first so we can generate a real breakdown.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            activeOpacity={0.85}
            onPress={() => router.replace("/(tabs)/upload")}
          >
            <Text style={styles.emptyButtonText}>Go to Upload</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const phaseKeys = getPhaseKeys().filter(
    (key) => session.analysis.phases[key],
  );
  const overallScore = Math.round(session.analysis.overall_score);
  const priorityPhaseKey = isAnalysisPhaseKey(session.analysis.priority)
    ? session.analysis.priority
    : "ready_position";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backText}>Upload</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SHOT BREAKDOWN</Text>
          <Text style={styles.headerSub}>
            Saved {new Date(session.createdAt).toLocaleString()}
          </Text>
        </View>

        <View style={styles.videoBox}>
          {session.analysis.pose_gif ? (
            <Image
              source={{
                uri: `data:image/gif;base64,${session.analysis.pose_gif}`,
              }}
              style={styles.poseGif}
              contentFit="contain"
            />
          ) : (
            <View style={styles.placeholderContent}>
              <MaterialIcons name="videocam-off" size={30} color="#777" />
              <Text style={styles.uploadLabel}>POSE GIF UNAVAILABLE</Text>
            </View>
          )}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>FOCUS AREA</Text>
          <Text style={styles.summaryValue}>
            {getPhaseLabel(priorityPhaseKey)}
          </Text>
        </View>

        <View style={styles.phaseList}>
          {phaseKeys.map((phaseKey, index) => {
            const phase = session.analysis.phases[phaseKey];

            if (!phase) {
              return null;
            }

            return (
              <TouchableOpacity
                key={phaseKey}
                style={styles.phaseRow}
                activeOpacity={0.7}
                onPress={() =>
                  router.push({
                    pathname: "/phase-detail",
                    params: { sessionId: session.id, phaseKey },
                  })
                }
              >
                <View style={styles.phaseLeft}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{index + 1}</Text>
                  </View>
                  <View>
                    <Text style={styles.phaseName}>
                      {getPhaseLabel(phaseKey)}
                    </Text>
                    <Text style={styles.phaseStatus}>
                      {phase.status.replace(/_/g, " ")}
                    </Text>
                  </View>
                </View>
                <View style={styles.phaseRight}>
                  <ScoreRing score={phase.score} />
                  <Text style={styles.chevron}>›</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.overallCard}>
          <Text style={styles.overallLabel}>OVERALL SCORE</Text>
          <View style={styles.overallRow}>
            <Text style={styles.overallScore}>{overallScore}</Text>
            <Text style={styles.overallGrade}>
              {scoreToGrade(overallScore)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.finishBtn}
          activeOpacity={0.85}
          onPress={() => router.push("/player-stats")}
        >
          <Text style={styles.finishText}>FINISH</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  header: {
    backgroundColor: ORANGE,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  backText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "500",
    marginTop: 2,
  },
  videoBox: {
    marginHorizontal: 16,
    marginTop: 18,
    minHeight: 220,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#0E0E0E",
    alignItems: "center",
    justifyContent: "center",
  },
  poseGif: {
    width: "150%",
    height: 330,
    backgroundColor: "#111",
  },
  placeholderContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 48,
  },
  uploadLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1.5,
  },
  summaryCard: {
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: "#202020",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  summaryValue: {
    marginTop: 6,
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  phaseList: { marginTop: 20, gap: 2 },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: ROW_BG,
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 0,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
    borderBottomWidth: 1,
    borderBottomColor: SEP,
  },
  phaseLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingLeft: 14,
  },
  phaseRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: ORANGE,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  phaseName: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  phaseStatus: {
    marginTop: 4,
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    textTransform: "capitalize",
  },
  chevron: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 22,
    fontWeight: "300",
  },
  ring: {
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  ringText: { color: "#fff", fontWeight: "700" },
  overallCard: {
    marginTop: 2,
    backgroundColor: ORANGE,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  overallLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  overallRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  overallScore: {
    color: "#fff",
    fontSize: 80,
    fontWeight: "900",
    lineHeight: 82,
    letterSpacing: -2,
  },
  overallGrade: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 64,
    fontWeight: "800",
    lineHeight: 70,
    letterSpacing: -1,
  },
  finishBtn: {
    marginTop: 2,
    backgroundColor: ORANGE,
    paddingVertical: 18,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  finishText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  centerStateTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  centerStateText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 8,
    backgroundColor: ORANGE,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
