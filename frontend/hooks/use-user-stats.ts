import { useDatabaseLiveValue } from "@/hooks/use-database";
import { type AppUserStats, getUserStatsPath } from "@/services/user-stats";
import { formatUserId } from "@/utils/user";

export function useUserStats(userSub: string | null | undefined) {
  const path = userSub ? getUserStatsPath(formatUserId(userSub)) : null;
  const { value, isLoading, error } = useDatabaseLiveValue<AppUserStats>(path);

  return {
    stats: value,
    isLoading,
    error,
  };
}
