import type { ImagePickerAsset } from "expo-image-picker";
import { push, ref, set } from "firebase/database";

import { db } from "@/config/firebase";
import { updateSportLeaderboardStats } from "@/services/leaderboard";
import type { AnalysisResult, AnalysisSession } from "@/types/analysis";

export async function saveAnalysisSession(params: {
  userId: string;
  asset: ImagePickerAsset;
  analysis: AnalysisResult;
}) {
  const { userId, asset, analysis } = params;
  const sessionsRef = ref(db, `users/${userId}/analysisSessions`);
  const sessionRef = push(sessionsRef);

  if (!sessionRef.key) {
    throw new Error("Unable to create an analysis session id.");
  }

  const timestamp = new Date().toISOString();
  const session: AnalysisSession = {
    id: sessionRef.key,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: {
      uri: asset.uri,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
      fileSize: asset.fileSize ?? null,
      durationMs: asset.duration ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
    },
    analysis,
  };

  await set(sessionRef, session);
  await set(ref(db, `users/${userId}/analysis/activeSessionId`), session.id);
  await updateSportLeaderboardStats({
    userId,
    score: analysis.overall_score,
  });

  return session;
}
