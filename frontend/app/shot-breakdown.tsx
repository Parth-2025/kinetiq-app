import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { AppBar } from "@/components/ui/AppBar";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListItem } from "@/components/ui/ListItem";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useApiQuery } from "@/hooks/use-api";
import type { AnalysisSession } from "@/types/analysis";
import { useTheme } from "@/theme";
import {
  getPhaseKeys,
  getPhaseLabel,
  isAnalysisPhaseKey,
  scoreToGrade,
} from "@/utils/analysis";

type SessionFull = {
  id: string;
  sport?: string;
  overall_score?: number | null;
  source?: AnalysisSession["source"];
  analysis: AnalysisSession["analysis"];
  created_at?: string;
};

export default function ShotBreakdownScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ sessionId?: string }>();

  const requestedSessionId =
    typeof params.sessionId === "string" ? params.sessionId : null;

  const key = requestedSessionId
    ? `session:${requestedSessionId}`
    : "session:active";
  const path = requestedSessionId
    ? `/me/sessions/${requestedSessionId}`
    : "/me/sessions/active";

  const { value: session, isLoading } = useApiQuery<SessionFull | null>(key, path);

  const appBar = <AppBar title="Shot analysis" onBack={() => router.back()} />;

  if (isLoading) {
    return (
      <Screen appBar={appBar}>
        <View style={{ alignItems: "center", gap: t.space.m, paddingTop: t.space.xxxl }}>
          <ActivityIndicator size="large" color={t.color.accent} />
          <Text variant="body1" color="textSecondary">
            Loading analysis…
          </Text>
        </View>
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen appBar={appBar}>
        <EmptyState
          icon="chart"
          title="No analysis yet"
          body="Upload a shot video so we can generate a breakdown."
          action={{
            label: "Go to Upload",
            onPress: () => router.replace("/(tabs)/upload"),
          }}
        />
      </Screen>
    );
  }

  const phaseKeys = getPhaseKeys().filter((k) => session.analysis.phases[k]);
  const overallScore = Math.round(session.analysis.overall_score);
  const priorityPhaseKey = isAnalysisPhaseKey(session.analysis.priority)
    ? session.analysis.priority
    : "ready_position";

  const savedAt = new Date(session.created_at ?? Date.now()).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
  const sportLabel = (session.sport ?? "basketball").replace(/^\w/, (c) =>
    c.toUpperCase(),
  );

  return (
    <Screen scroll appBar={appBar}>
      <View style={{ gap: t.space.l }}>
        <Card>
          <View style={{ alignItems: "center", gap: t.space.s }}>
            <ScoreRing score={overallScore} label={scoreToGrade(overallScore)} />
            <Text variant="subtitle1">
              Focus: {getPhaseLabel(priorityPhaseKey)}
            </Text>
            <Text variant="caption1" color="textSecondary">
              {sportLabel} · {savedAt}
            </Text>
          </View>
        </Card>

        {session.analysis.pose_gif ? (
          <Card pad="s">
            <Image
              source={{
                uri: `data:image/gif;base64,${session.analysis.pose_gif}`,
              }}
              style={{ width: "100%", height: 240, borderRadius: t.radius.l }}
              contentFit="contain"
            />
          </Card>
        ) : null}

        <View style={{ gap: t.space.s }}>
          <Text variant="subtitle1">Phases</Text>
          {phaseKeys.map((k, i) => {
            const phase = session.analysis.phases[k];
            if (!phase) return null;
            return (
              <ListItem
                key={k}
                title={getPhaseLabel(k)}
                subtitle={phase.status.replace(/_/g, " ")}
                trailing={<ScoreRing score={phase.score} size={36} />}
                divider={i < phaseKeys.length - 1}
                onPress={() =>
                  router.push({
                    pathname: "/phase-detail",
                    params: { sessionId: session.id, phaseKey: k },
                  })
                }
              />
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
