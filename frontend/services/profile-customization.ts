import { ref, runTransaction } from "firebase/database";

import {
  normalizeProfileCustomization,
  type ProfileCustomizationState,
} from "@/components/profile-cosmetics";
import { db } from "@/config/firebase";

export const VIDEO_UPLOAD_POINTS_REWARD = 100;

export function getProfileCustomizationPath(userId: string) {
  return `users/${userId}/profileCustomization`;
}

export async function addProfileCustomizationPoints(params: {
  userId: string;
  points: number;
}) {
  const { userId, points } = params;
  const customizationRef = ref(db, getProfileCustomizationPath(userId));

  const result = await runTransaction(customizationRef, (currentValue) => {
    const current = normalizeProfileCustomization(
      (currentValue as Partial<ProfileCustomizationState> | null) ?? null,
    );

    return {
      ...current,
      points: Math.max(0, current.points + points),
    } satisfies ProfileCustomizationState;
  });

  if (!result.committed || !result.snapshot.exists()) {
    throw new Error("Unable to update profile customization points.");
  }

  return result.snapshot.val() as ProfileCustomizationState;
}
