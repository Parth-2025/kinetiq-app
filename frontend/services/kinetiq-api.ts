import type { ImagePickerAsset } from "expo-image-picker";

import { requireRuntimeConfig } from "@/config/runtime";
import type { AnalysisResult } from "@/types/analysis";

function buildVideoPart(asset: ImagePickerAsset) {
  const fallbackName =
    asset.fileName ??
    `shot.${asset.mimeType?.split("/")[1] ?? "mp4"}`;

  if (asset.file) {
    return asset.file;
  }

  return {
    uri: asset.uri,
    name: fallbackName,
    type: asset.mimeType ?? "video/mp4",
  } as any;
}

export async function analyzeVideo(asset: ImagePickerAsset, sport: string) {
  const apiUrl = requireRuntimeConfig(
    "kinetiqApiUrl",
    "Missing EXPO_PUBLIC_KINETIQ_API_URL. Add the KinetiQ backend base URL to your environment.",
  );

  const formData = new FormData();
  formData.append("video", buildVideoPart(asset));
  formData.append("sport", (sport || "basketball").toLowerCase());

  const response = await fetch(`${apiUrl}/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `KinetiQ analysis failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as AnalysisResult;
}
