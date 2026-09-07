import { router } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
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

export default function ProfileScreen() {
  const t = useTheme();
  const { user, logout } = useAuth();
  const { profile } = useUserProfile(user?.sub);
  const { stats } = useUserStats(user?.sub);
  const { value: sessions, isLoading } = useApiQuery<SessionMeta[]>(
    "sessions",
    "/me/sessions?limit=4",
  );

  const name = profile?.displayName || user?.name || "KinetiQ player";
  const handle = profile?.username ? `@${profile.username}` : "@you";
  const level = stats?.level ?? 0;
  const progress = (stats?.progressPct ?? 0) / 100;
  const toNextLevel = (stats?.nextLevelExp ?? 0) - (stats?.exp ?? 0);

  return (
    <Screen scroll>
      <View style={{ gap: t.space.l }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.m }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: t.color.accentSubtle,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="person" size={26} color="accent" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title2" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="body1" color="textSecondary">
              {handle}
            </Text>
          </View>
        </View>

        <StatGrid
          items={[
            { value: String(stats?.videosUploaded ?? 0), label: "Videos" },
            { value: String(level), label: "Level" },
            { value: String(stats?.bestScore ?? 0), label: "Best score" },
            { value: (stats?.avgScore ?? 0).toFixed(1), label: "Avg score" },
          ]}
        />

        <View style={{ gap: t.space.s }}>
          <ProgressBar value={progress} />
          <Text variant="caption1" color="textSecondary">
            {toNextLevel} XP to level {level + 1}
          </Text>
        </View>

        <View style={{ gap: t.space.s }}>
          <Text variant="subtitle1">Recent sessions</Text>
          {isLoading ? (
            <View style={{ gap: t.space.s }}>
              <Skeleton width="100%" height={56} />
              <Skeleton width="100%" height={56} />
            </View>
          ) : sessions && sessions.length > 0 ? (
            sessions.map((s, i) => (
              <ListItem
                key={s.id}
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
              Upload a shot to start building your stats.
            </Text>
          )}
        </View>

        <Button
          label="Sign out"
          icon="sign-out"
          appearance="outline"
          fullWidth
          onPress={logout}
        />
      </View>
    </Screen>
  );
}
