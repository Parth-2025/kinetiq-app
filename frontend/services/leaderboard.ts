import { get, ref, set, update } from "firebase/database";

import { db } from "@/config/firebase";

export const BASKETBALL_LEADERBOARD_KEY = "Basketball";

export interface LeaderboardSportStats {
  first_score: number;
  max_score: number;
  most_improved: number;
  num_videos: number;
  latest_score: number;
  updatedAt: string;
}

export interface LeaderboardSeedUser {
  profile?: {
    username?: string;
    displayName?: string;
  };
  leaderboards?: Record<string, LeaderboardSportStats | undefined>;
}

export function getSportLeaderboardPath(userId: string, sport = BASKETBALL_LEADERBOARD_KEY) {
  return `users/${userId}/leaderboards/${sport}`;
}

export async function updateSportLeaderboardStats(params: {
  userId: string;
  score: number;
  sport?: string;
}) {
  const { userId, score, sport = BASKETBALL_LEADERBOARD_KEY } = params;
  const leaderboardRef = ref(db, getSportLeaderboardPath(userId, sport));
  const snapshot = await get(leaderboardRef);
  const now = new Date().toISOString();

  const normalizedScore = Math.round(score);
  const existing = snapshot.exists()
    ? (snapshot.val() as Partial<LeaderboardSportStats>)
    : null;

  const firstScore = typeof existing?.first_score === "number"
    ? existing.first_score
    : normalizedScore;
  const maxScore = Math.max(
    typeof existing?.max_score === "number" ? existing.max_score : normalizedScore,
    normalizedScore,
  );
  const numVideos = Math.max(
    0,
    typeof existing?.num_videos === "number" ? existing.num_videos : 0,
  ) + 1;

  const stats: LeaderboardSportStats = {
    first_score: firstScore,
    max_score: maxScore,
    most_improved: Math.max(0, maxScore - firstScore),
    num_videos: numVideos,
    latest_score: normalizedScore,
    updatedAt: now,
  };

  await set(leaderboardRef, stats);

  return stats;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function buildSampleLeaderboardStats(seed: string): LeaderboardSportStats {
  const hash = hashString(seed);
  const firstScore = 72 + (hash % 15);
  const improvement = 7 + ((hash >> 4) % 15);
  const maxScore = Math.min(99, firstScore + improvement);
  const numVideos = 4 + ((hash >> 8) % 29);
  const latestScore = Math.max(firstScore, maxScore - ((hash >> 12) % 6));
  const month = ((hash >> 16) % 9) + 1;
  const day = ((hash >> 20) % 20) + 1;

  return {
    first_score: firstScore,
    max_score: maxScore,
    most_improved: maxScore - firstScore,
    num_videos: numVideos,
    latest_score: latestScore,
    updatedAt: new Date(Date.UTC(2026, month, day, 15, 0, 0)).toISOString(),
  };
}

export async function seedSampleBasketballLeaderboard(params: {
  users: Record<string, LeaderboardSeedUser>;
}) {
  const updates: Record<string, LeaderboardSportStats> = {};

  for (const [userId, node] of Object.entries(params.users)) {
    const username = node.profile?.username?.trim();
    const existingStats = node.leaderboards?.[BASKETBALL_LEADERBOARD_KEY];

    if (!username || existingStats) {
      continue;
    }

    updates[getSportLeaderboardPath(userId)] = buildSampleLeaderboardStats(
      `${userId}:${username}`,
    );
  }

  if (!Object.keys(updates).length) {
    return false;
  }

  await update(ref(db), updates);
  return true;
}
