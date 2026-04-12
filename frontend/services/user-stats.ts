import { get, ref, runTransaction } from "firebase/database";

import { db } from "@/config/firebase";

export const VIDEO_EXP_REWARD = 50;
export const BASE_LEVEL_EXP = 50;

export interface AppUserStats {
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
  updatedAt: string;
}

export function getUserStatsPath(userId: string) {
  return `users/${userId}/stats`;
}

export function getTotalExpRequiredForLevel(level: number) {
  if (level <= 0) {
    return 0;
  }

  return (BASE_LEVEL_EXP * level * (level + 1)) / 2;
}

export function calculateLevelProgress(exp: number) {
  let level = 0;

  while (exp >= getTotalExpRequiredForLevel(level + 1)) {
    level += 1;
  }

  const currentLevelExp = getTotalExpRequiredForLevel(level);
  const nextLevelExp = getTotalExpRequiredForLevel(level + 1);
  const expIntoLevel = Math.max(0, exp - currentLevelExp);
  const expRequiredThisLevel = Math.max(1, nextLevelExp - currentLevelExp);
  const progressPct = Math.min(
    100,
    Math.round((expIntoLevel / expRequiredThisLevel) * 100),
  );

  return {
    level,
    progressPct,
    currentLevelExp,
    nextLevelExp,
    expIntoLevel,
    expRequiredThisLevel,
  };
}

export async function updateUserStats(params: {
  userId: string;
  score: number;
}) {
  const { userId, score } = params;
  const statsRef = ref(db, getUserStatsPath(userId));
  const normalizedScore = Math.round(score);
  const now = new Date().toISOString();

  const result = await runTransaction(statsRef, (currentValue) => {
    const current = (currentValue as Partial<AppUserStats> | null) ?? null;
    const videosUploaded = Math.max(
      0,
      typeof current?.videosUploaded === "number" ? current.videosUploaded : 0,
    ) + 1;
    const shotsAnalyzed = Math.max(
      0,
      typeof current?.shotsAnalyzed === "number" ? current.shotsAnalyzed : 0,
    ) + 1;
    const totalScore = Math.max(
      0,
      typeof current?.totalScore === "number" ? current.totalScore : 0,
    ) + normalizedScore;
    const exp = videosUploaded * VIDEO_EXP_REWARD;
    const levelProgress = calculateLevelProgress(exp);

    return {
      videosUploaded,
      shotsAnalyzed,
      totalScore,
      avgScore: Number((totalScore / shotsAnalyzed).toFixed(1)),
      bestScore: Math.max(
        typeof current?.bestScore === "number" ? current.bestScore : normalizedScore,
        normalizedScore,
      ),
      latestScore: normalizedScore,
      exp,
      level: levelProgress.level,
      progressPct: levelProgress.progressPct,
      currentLevelExp: levelProgress.currentLevelExp,
      nextLevelExp: levelProgress.nextLevelExp,
      updatedAt: now,
    } satisfies AppUserStats;
  });

  if (!result.committed || !result.snapshot.exists()) {
    const snapshot = await get(statsRef);

    if (!snapshot.exists()) {
      throw new Error("Unable to update user stats.");
    }

    return snapshot.val() as AppUserStats;
  }

  return result.snapshot.val() as AppUserStats;
}
