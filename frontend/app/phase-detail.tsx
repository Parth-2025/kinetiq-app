import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, View } from "react-native";

import { AppBar } from "@/components/ui/AppBar";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListItem } from "@/components/ui/ListItem";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useApiQuery } from "@/hooks/use-api";
import type { AnalysisSession } from "@/types/analysis";
import { useTheme } from "@/theme";
import { formatAngleLabel, getPhaseLabel, isAnalysisPhaseKey } from "@/utils/analysis";

type SessionFull = { analysis: AnalysisSession["analysis"] };

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

function measureTone(score: number): "success" | "accent" | "danger" {
  if (score >= 85) return "success";
  if (score >= 70) return "accent";
  return "danger";
}

export default function PhaseDetailScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ sessionId?: string; phaseKey?: string }>();
  const phaseKey =
    typeof params.phaseKey === "string" && isAnalysisPhaseKey(params.phaseKey)
      ? params.phaseKey
      : "ready_position";
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;

  const { value: session } = useApiQuery<SessionFull | null>(
    sessionId ? `session:${sessionId}` : null,
    sessionId ? `/me/sessions/${sessionId}` : null,
  );

  const phase = session?.analysis.phases[phaseKey];
  const phaseImages = session?.analysis.phase_images?.[phaseKey];
  const measurements = phase?.angles_measured ?? {};
  const appBar = <AppBar title={getPhaseLabel(phaseKey)} onBack={() => router.back()} />;

  if (!session || !phase) {
    return (
      <Screen appBar={appBar}>
        <EmptyState
          icon="chart"
          title="Phase details unavailable"
          body="Open a saved shot analysis first."
          action={{ label: "Back to breakdown", onPress: () => router.replace("/shot-breakdown") }}
        />
      </Screen>
    );
  }

  const measureEntries = Object.entries(measurements);

  return (
    <Screen scroll appBar={appBar}>
      <View style={{ gap: t.space.l }}>
        <Card>
          <View style={{ alignItems: "center", gap: t.space.s }}>
            <ScoreRing score={phase.score} />
            <Text variant="body1" color="textSecondary" align="center">
              {phase.feedback}
            </Text>
          </View>
        </Card>

        {phaseImages?.user_frame || phaseImages?.ideal_frame ? (
          <View style={{ gap: t.space.s }}>
            <Text variant="subtitle1">Your form vs ideal</Text>
            <View style={{ flexDirection: "row", gap: t.space.s }}>
              {[
                { uri: phaseImages?.user_frame, label: "You" },
                { uri: phaseImages?.ideal_frame, label: "Ideal" },
              ].map((f) => (
                <View key={f.label} style={{ flex: 1, gap: t.space.xs }}>
                  {f.uri ? (
                    <Image
                      source={{ uri: `data:image/png;base64,${f.uri}` }}
                      style={{ width: "100%", height: 170, borderRadius: t.radius.l, backgroundColor: t.color.layerAlt }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{ height: 170, borderRadius: t.radius.l, backgroundColor: t.color.layerAlt }} />
                  )}
                  <Text variant="caption1" color="textSecondary" align="center">
                    {f.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {measureEntries.length ? (
          <View style={{ gap: t.space.s }}>
            <Text variant="subtitle1">Measurements</Text>
            {measureEntries.map(([label, value], i) => (
              <ListItem
                key={label}
                title={formatAngleLabel(label)}
                subtitle={`Ideal ${value.ideal}`}
                trailing={
                  <Chip label={`${Math.round(value.value)}°`} tone={measureTone(value.score)} />
                }
                divider={i < measureEntries.length - 1}
              />
            ))}
          </View>
        ) : null}

        {phase.resources.length ? (
          <View style={{ gap: t.space.s }}>
            <Text variant="subtitle1">Resources</Text>
            {phase.resources.map((r, i) => (
              <ListItem
                key={`${r.label}:${r.url}`}
                title={r.label}
                trailing="chevron"
                divider={i < phase.resources.length - 1}
                onPress={() => Linking.openURL(getWorkingResourceUrl(r.url))}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
