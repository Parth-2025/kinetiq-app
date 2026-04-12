import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/auth-context";
import { useDatabaseLiveValue } from "@/hooks/use-database";
import type { AnalysisSession } from "@/types/analysis";
import {
  formatAngleLabel,
  getPhaseLabel,
  getScoreColor,
  isAnalysisPhaseKey,
  splitAngleMeasurements,
} from "@/utils/analysis";
import { formatUserId } from "@/utils/user";

const ORANGE = "#E85D04";
const BG = "#181818";
const ROW_BG = "#242424";
const SEP = "#2E2E2E";
const GREEN = "#3DD9C0";
const YELLOW = "#E8B840";

const RESOURCE_URL_REPLACEMENTS: Record<string, string> = {
  "https://www.youtube.com/watch?v=FBaQjmUMmGo":
    "https://jr.nba.com/video/set-up-your-footwork-before-your-shot/",
  "https://www.breakthroughbasketball.com/skills/shooting.html":
    "https://jr.nba.com/video/fundamentals-of-shooting/",
  "https://www.youtube.com/watch?v=cGbHkeoO4Gc":
    "https://jr.nba.com/video/practice-the-shooting-proper-form/",
  "https://www.breakthroughbasketball.com/skills/jump-shot.html":
    "https://www.breakthroughbasketball.com/fundamentals/shooting-technique.html",
  "https://www.youtube.com/watch?v=xBRL8oZHHG8":
    "https://jr.nba.com/dirk-shows-off-perfect-shooting-form/",
  "https://www.breakthroughbasketball.com/skills/set-point.html":
    "https://jr.nba.com/video/form-shooting-2-hands/",
  "https://www.youtube.com/watch?v=KTPOhJJHoHk":
    "https://jr.nba.com/video/1-step-form-shooting/",
  "https://www.youtube.com/watch?v=7m0Kq2Dm0nI":
    "https://www.breakthroughbasketball.com/fundamentals/shooting.html",
  "https://www.youtube.com/watch?v=5cXn2bRSm3M":
    "https://jr.nba.com/video/perfect-shot-no-basket/",
  "https://www.youtube.com/watch?v=aBbhXOJ3PBs":
    "https://jr.nba.com/jr-nba-at-home-form-shooting/",
};

function getWorkingResourceUrl(url: string) {
  return RESOURCE_URL_REPLACEMENTS[url] ?? url;
}

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
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
      <Text style={[styles.ringText, { fontSize: size * 0.31 }]}>
        {Math.round(score)}
      </Text>
    </View>
  );
}

function FeedbackRow({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "positive" | "warning" | "neutral";
}) {
  return (
    <View style={styles.feedRow}>
      <View
        style={[
          styles.feedMarker,
          tone === "positive"
            ? styles.feedMarkerPositive
            : tone === "warning"
              ? styles.feedMarkerWarning
              : styles.feedMarkerNeutral,
        ]}
      />
      <Text style={styles.feedText}>{text}</Text>
    </View>
  );
}

export default function PhaseDetailScreen() {
  const params = useLocalSearchParams<{ sessionId?: string; phaseKey?: string }>();
  const { user } = useAuth();
  const userId = formatUserId(user?.sub);
  const phaseKey =
    typeof params.phaseKey === "string" && isAnalysisPhaseKey(params.phaseKey)
      ? params.phaseKey
      : "ready_position";
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;

  const { value: session } = useDatabaseLiveValue<AnalysisSession>(
    sessionId ? `users/${userId}/analysisSessions/${sessionId}` : null,
  );

  const phase = session?.analysis.phases[phaseKey];
  const phaseImages = session?.analysis.phase_images?.[phaseKey];
  const measurements = phase?.angles_measured ?? {};
  const { working, improve } = splitAngleMeasurements(measurements);

  if (!session || !phase) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Phase details unavailable</Text>
          <Text style={styles.emptyText}>
            Open a saved shot analysis first so we can show backend feedback here.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            activeOpacity={0.85}
            onPress={() => router.replace("/shot-breakdown")}
          >
            <Text style={styles.emptyButtonText}>Back to Breakdown</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>{getPhaseLabel(phaseKey)}</Text>
              <Text style={styles.headerSub}>{phase.description}</Text>
            </View>
            <ScoreRing score={phase.score} />
          </View>
        </View>

        <View style={styles.refBox}>
          <View style={styles.frameColumn}>
            {phaseImages?.user_frame ? (
              <Image
                source={{
                  uri: `data:image/png;base64,${phaseImages.user_frame}`,
                }}
                style={styles.phaseFrame}
                contentFit="cover"
              />
            ) : (
              <View style={styles.framePlaceholder}>
                <MaterialIcons
                  name="sports-basketball"
                  size={32}
                  color="rgba(255,255,255,0.2)"
                />
              </View>
            )}
            <Text style={styles.frameLabel}>YOUR FRAME</Text>
          </View>

          <View style={styles.frameColumn}>
            {phaseImages?.ideal_frame ? (
              <Image
                source={{
                  uri: `data:image/png;base64,${phaseImages.ideal_frame}`,
                }}
                style={styles.phaseFrame}
                contentFit="cover"
              />
            ) : (
              <View style={styles.framePlaceholder}>
                <MaterialIcons name="auto-fix-high" size={32} color="rgba(255,255,255,0.2)" />
              </View>
            )}
            <Text style={styles.frameLabel}>IDEAL FORM</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Coach Summary</Text>
          <Text style={styles.summaryText}>{phase.feedback}</Text>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHeader, { borderLeftColor: GREEN }]}>
            <Text style={[styles.sectionTitle, { color: GREEN }]}>WHAT IS WORKING</Text>
          </View>
          {(working.length ? working : ["No standout measurements yet for this phase."]).map(
            (item) => (
              <FeedbackRow key={item} text={item} tone="positive" />
            ),
          )}
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHeader, { borderLeftColor: ORANGE }]}>
            <Text style={[styles.sectionTitle, { color: ORANGE }]}>WHAT TO FIX</Text>
          </View>
          {(improve.length ? improve : ["This phase is grading well right now."]).map((item) => (
            <FeedbackRow key={item} text={item} tone="warning" />
          ))}
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHeader, { borderLeftColor: YELLOW }]}>
            <Text style={[styles.sectionTitle, { color: YELLOW }]}>MEASURED ANGLES</Text>
          </View>
          {Object.entries(measurements).map(([label, value]) => (
            <View key={label} style={styles.measureRow}>
              <View>
                <Text style={styles.measureLabel}>{formatAngleLabel(label)}</Text>
                <Text style={styles.measureIdeal}>Ideal: {value.ideal}</Text>
              </View>
              <View style={styles.measureRight}>
                <Text style={styles.measureValue}>{Math.round(value.value)}°</Text>
                <Text
                  style={[
                    styles.measureScore,
                    { color: getScoreColor(value.score) },
                  ]}
                >
                  {Math.round(value.score)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {phase.resources.length ? (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { borderLeftColor: "#6FA8FF" }]}>
              <Text style={[styles.sectionTitle, { color: "#6FA8FF" }]}>RESOURCES</Text>
            </View>
            {phase.resources.map((resource) => (
              <TouchableOpacity
                key={`${resource.label}:${resource.url}`}
                style={styles.resourceRow}
                activeOpacity={0.8}
                onPress={() => Linking.openURL(getWorkingResourceUrl(resource.url))}
              >
                <Text style={styles.resourceLabel}>{resource.label}</Text>
                <MaterialIcons name="open-in-new" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingBottom: 48 },
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
  backText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  headerSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    marginTop: 4,
    lineHeight: 20,
  },
  ring: {
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  ringText: { color: "#fff", fontWeight: "700" },
  refBox: {
    marginTop: 16,
    marginHorizontal: 16,
    flexDirection: "row",
    gap: 12,
  },
  frameColumn: {
    flex: 1,
    gap: 8,
  },
  phaseFrame: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "#111",
  },
  framePlaceholder: {
    height: 180,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  frameLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.3,
    textAlign: "center",
  },
  summaryCard: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: "#202020",
    borderRadius: 14,
    padding: 16,
  },
  summaryTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  summaryText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    lineHeight: 22,
  },
  section: {
    marginTop: 16,
  },
  sectionHeader: {
    borderLeftWidth: 4,
    paddingLeft: 14,
    paddingVertical: 14,
    backgroundColor: ROW_BG,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  feedRow: {
    backgroundColor: ROW_BG,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: SEP,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  feedMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  feedMarkerPositive: { backgroundColor: GREEN },
  feedMarkerWarning: { backgroundColor: ORANGE },
  feedMarkerNeutral: { backgroundColor: "#888" },
  feedText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "400",
    flex: 1,
    lineHeight: 22,
  },
  measureRow: {
    backgroundColor: ROW_BG,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: SEP,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  measureLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  measureIdeal: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 4,
  },
  measureRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  measureValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  measureScore: {
    fontSize: 13,
    fontWeight: "700",
  },
  resourceRow: {
    backgroundColor: ROW_BG,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: SEP,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  resourceLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 8,
  },
  emptyText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 16,
    backgroundColor: ORANGE,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
