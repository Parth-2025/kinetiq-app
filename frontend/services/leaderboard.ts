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

export interface SampleLeaderboardPlayer {
  id: string;
  username: string;
  displayName: string;
}

type SampleLeaderboardPlayerWithStats = SampleLeaderboardPlayer & {
  stats: LeaderboardSportStats;
};

const SAMPLE_LEADERBOARD_PLAYER_DATA: SampleLeaderboardPlayerWithStats[] = [
  {
    id: "hoops_legend",
    username: "hoops_legend",
    displayName: "Hoops Legend",
    stats: {
      first_score: 80,
      max_score: 97,
      most_improved: 17,
      num_videos: 26,
      latest_score: 95,
      updatedAt: "2026-03-18T15:00:00.000Z",
    },
  },
  {
    id: "crossover_pro",
    username: "crossover_pro",
    displayName: "Crossover Pro",
    stats: {
      first_score: 78,
      max_score: 94,
      most_improved: 16,
      num_videos: 21,
      latest_score: 92,
      updatedAt: "2026-03-22T15:00:00.000Z",
    },
  },
  {
    id: "slam_dunk_21",
    username: "slam_dunk_21",
    displayName: "Slam Dunk 21",
    stats: {
      first_score: 76,
      max_score: 91,
      most_improved: 15,
      num_videos: 18,
      latest_score: 89,
      updatedAt: "2026-03-25T15:00:00.000Z",
    },
  },
  {
    id: "fade_away",
    username: "fade_away",
    displayName: "Fade Away",
    stats: {
      first_score: 79,
      max_score: 93,
      most_improved: 14,
      num_videos: 17,
      latest_score: 90,
      updatedAt: "2026-03-29T15:00:00.000Z",
    },
  },
  {
    id: "ankle_breaker",
    username: "ankle_breaker",
    displayName: "Ankle Breaker",
    stats: {
      first_score: 74,
      max_score: 88,
      most_improved: 14,
      num_videos: 15,
      latest_score: 87,
      updatedAt: "2026-04-01T15:00:00.000Z",
    },
  },
  {
    id: "three_specialist",
    username: "three_specialist",
    displayName: "Three Specialist",
    stats: {
      first_score: 77,
      max_score: 90,
      most_improved: 13,
      num_videos: 19,
      latest_score: 88,
      updatedAt: "2026-04-04T15:00:00.000Z",
    },
  },
  {
    id: "rim_protector",
    username: "rim_protector",
    displayName: "Rim Protector",
    stats: {
      first_score: 75,
      max_score: 87,
      most_improved: 12,
      num_videos: 16,
      latest_score: 86,
      updatedAt: "2026-04-07T15:00:00.000Z",
    },
  },
];

export const SAMPLE_LEADERBOARD_PLAYERS: SampleLeaderboardPlayer[] =
  SAMPLE_LEADERBOARD_PLAYER_DATA.map(({ id, username, displayName }) => ({
    id,
    username,
    displayName,
  }));

export function getSportLeaderboardPath(userId: string, sport = BASKETBALL_LEADERBOARD_KEY) {
  return `users/${userId}/leaderboards/${sport}`;
}

export function normalizeLeaderboardStats(
  value: Partial<LeaderboardSportStats> | null | undefined,
): LeaderboardSportStats | null {
  if (!value) {
    return null;
  }

  const firstScore = Math.max(
    0,
    typeof value.first_score === "number" ? Math.round(value.first_score) : 0,
  );
  const latestScore = Math.max(
    0,
    typeof value.latest_score === "number" ? Math.round(value.latest_score) : firstScore,
  );
  const maxScore = Math.max(
    firstScore,
    latestScore,
    typeof value.max_score === "number" ? Math.round(value.max_score) : latestScore,
  );
  const numVideos = Math.max(
    0,
    typeof value.num_videos === "number" ? Math.round(value.num_videos) : 0,
  );

  return {
    first_score: firstScore,
    max_score: maxScore,
    most_improved: Math.max(0, maxScore - firstScore),
    num_videos: numVideos,
    latest_score: latestScore,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

export async function sanitizeBasketballLeaderboardStats(params: {
  users: Record<string, LeaderboardSeedUser>;
}) {
  const updates: Record<string, LeaderboardSportStats> = {};

  for (const [userId, node] of Object.entries(params.users)) {
    const existingStats = node.leaderboards?.[BASKETBALL_LEADERBOARD_KEY];

    if (!existingStats) {
      continue;
    }

    const normalizedStats = normalizeLeaderboardStats(existingStats);

    if (!normalizedStats) {
      continue;
    }

    const repairedStats = normalizedStats;

    const hasChanged =
      repairedStats.first_score !== existingStats.first_score ||
      repairedStats.max_score !== existingStats.max_score ||
      repairedStats.most_improved !== existingStats.most_improved ||
      repairedStats.num_videos !== existingStats.num_videos ||
      repairedStats.latest_score !== existingStats.latest_score;

    if (!hasChanged) {
      continue;
    }

    updates[getSportLeaderboardPath(userId)] = repairedStats;
  }

  if (!Object.keys(updates).length) {
    return false;
  }

  await update(ref(db), updates);
  return true;
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

  const stats = normalizeLeaderboardStats({
    first_score: firstScore,
    max_score: maxScore,
    most_improved: Math.max(0, maxScore - firstScore),
    num_videos: numVideos,
    latest_score: normalizedScore,
    updatedAt: now,
  });

  if (!stats) {
    throw new Error("Unable to normalize leaderboard stats.");
  }

  await set(leaderboardRef, stats);

  return stats;
}

function buildSampleLeaderboardStats(seed: string): LeaderboardSportStats {
  const samplePlayer = SAMPLE_LEADERBOARD_PLAYER_DATA.find(
    (player) => `${player.id}:${player.username}` === seed,
  );

  if (!samplePlayer) {
    throw new Error(`Missing sample leaderboard stats for seed "${seed}".`);
  }

  return normalizeLeaderboardStats(samplePlayer.stats) as LeaderboardSportStats;
}

export function getSampleLeaderboardStats(seed: string) {
  return buildSampleLeaderboardStats(seed);
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
