import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { AppBar } from "@/components/ui/AppBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListItem } from "@/components/ui/ListItem";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatGrid } from "@/components/ui/StatGrid";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/icons/Icon";
import { useAuth } from "@/context/auth-context";
import { useApiQuery } from "@/hooks/use-api";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useUserStats } from "@/hooks/use-user-stats";
import { useTheme } from "@/theme";
import { scoreToGrade } from "@/utils/analysis";

type SessionMeta = {
  id: string;
  sport: string;
  overall_score: number | null;
  created_at: string;
};

export default function HomeScreen() {
  const t = useTheme();
  const { user } = useAuth();
  const { profile } = useUserProfile(user?.sub);
  const { stats, isLoading: statsLoading } = useUserStats(user?.sub);
  const { value: sportsState } = useApiQuery<{ active: string | null }>("sports", "/me/sports");
  const { value: sessions, isLoading: sessionsLoading } = useApiQuery<SessionMeta[]>(
    "sessions",
    "/me/sessions?limit=4",
  );

  const activeSport = sportsState?.active ?? "basketball";
  const sportLabel = activeSport.charAt(0).toUpperCase() + activeSport.slice(1);
  const level = stats?.level ?? 0;
  const progress = (stats?.progressPct ?? 0) / 100;
  const toNextLevel = (stats?.nextLevelExp ?? 0) - (stats?.exp ?? 0);

  return (
    <Screen
      scroll
      appBar={
        <AppBar
          title="KinetiQ"
          trailing={
            <Pressable
              onPress={() => router.push("/(tabs)/profile")}
              hitSlop={8}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: t.color.accentSubtle,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="person" size={18} color="accent" />
            </Pressable>
          }
        />
      }
    >
      <View style={{ gap: t.space.l }}>
        <View style={{ gap: t.space.xs }}>
          <Text variant="caption1" color="textSecondary">
            {profile?.username ? `@${profile.username}` : "Welcome back"}
          </Text>
          <Text variant="title2">Your progress</Text>
        </View>

        {statsLoading ? (
          <Skeleton width="100%" height={120} />
        ) : (
          <StatGrid
            items={[
              { value: String(level), label: "Level" },
              { value: String(stats?.videosUploaded ?? 0), label: "Videos" },
              { value: String(stats?.bestScore ?? 0), label: "Best score" },
              { value: (stats?.avgScore ?? 0).toFixed(1), label: "Avg score" },
            ]}
          />
        )}

        <View style={{ gap: t.space.s }}>
          <ProgressBar value={progress} />
          <Text variant="caption1" color="textSecondary">
            {toNextLevel} XP to level {level + 1}
          </Text>
        </View>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.m }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="caption1" color="textSecondary">
                Active sport
              </Text>
              <Text variant="subtitle1">{sportLabel}</Text>
            </View>
            <Button label="Change" appearance="subtle" size="sm" onPress={() => router.push("/sports")} />
          </View>
        </Card>

        <View style={{ gap: t.space.s }}>
          <Text variant="subtitle1">Recent</Text>
          {sessionsLoading ? (
            <View style={{ gap: t.space.s }}>
              <Skeleton width="100%" height={56} />
              <Skeleton width="100%" height={56} />
            </View>
          ) : sessions && sessions.length > 0 ? (
            sessions.map((s, i) => (
              <ListItem
                key={s.id}
                leading="history"
                title={`${Math.round(s.overall_score ?? 0)} · ${scoreToGrade(
                  Math.round(s.overall_score ?? 0),
                )}`}
                subtitle={new Date(s.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                trailing="chevron"
                divider={i < sessions.length - 1}
                onPress={() =>
                  router.push({ pathname: "/shot-breakdown", params: { sessionId: s.id } })
                }
              />
            ))
          ) : (
            <Text variant="body1" color="textSecondary">
              No analyses yet — upload your first shot.
            </Text>
          )}
        </View>

        <Card onPress={() => router.push("/(tabs)/upload")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.m }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: t.color.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="arrow-upload" size={22} color="onAccent" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body1Strong">Analyze a new shot</Text>
              <Text variant="caption1" color="textSecondary">
                Record or upload a clip to get your breakdown.
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color="textSecondary" />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
