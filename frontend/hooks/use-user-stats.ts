import { useApiQuery } from "@/hooks/use-api";

export type AppUserStats = {
  videosUploaded: number;
  shotsAnalyzed: number;
  totalScore: number;
  avgScore: number;
  bestScore: number;
  latestScore: number;
  exp: number;
  level: number;
  progressPct: number;
  currentLevelExp: number;
  nextLevelExp: number;
};

export function useUserStats(userSub: string | null | undefined) {
  const key = userSub ? "stats" : null;
  const { value, isLoading, error } = useApiQuery<AppUserStats>(
    key,
    key ? "/me/stats" : null,
  );
  return { stats: value, isLoading, error };
}
