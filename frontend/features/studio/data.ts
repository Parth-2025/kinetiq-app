import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/config/api";
import { useAuth } from "@/context/auth-context";
import { invalidate, useApiQuery } from "@/hooks/use-api";

export type BallVideoPoint = {
  time_ms: number;
  center: [number, number]; // normalized source-image coordinates
  bbox: [number, number, number, number];
  score: number | null;
  frame_index?: number;
};
export type BallVideoEvidence = {
  schema_version: "ball_video.v1";
  status: string;
  reason?: string | null;
  reason_code?: string;
  tracks?: { track_id: string; points: BallVideoPoint[]; gap_count?: number; missing_spans?: number }[];
  attempts?: { id: string; track_id: string; start_ms: number; end_ms: number;
    release?: { status: string; earliest_ms?: number; latest_ms?: number; time_ms?: number };
    status?: string }[];
  source?: { width_px?: number; height_px?: number; processed_samples?: number; complete?: boolean };
  quality?: Record<string, number>;
  limitations?: string[];
};

/** Older saved analyses omit ball evidence; malformed or unknown schemas stay unavailable. */
export function ballEvidenceFromAnalysis(analysis: unknown): BallVideoEvidence | undefined {
  if (!analysis || typeof analysis !== "object") return undefined;
  const ball = (analysis as { ball?: unknown }).ball;
  if (!ball || typeof ball !== "object" || (ball as { schema_version?: unknown }).schema_version !== "ball_video.v1") return undefined;
  return ball as BallVideoEvidence;
}

export function useStudio<T>(path: string | null) {
  const { user } = useAuth();
  return useApiQuery<T>(
    user && path ? `studio:${user.sub}:${path}` : null,
    user && path ? `/studio${path}` : null,
  );
}

export function useStudioAction() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T>(
      path: string,
      method: "POST" | "PATCH" | "PUT" | "DELETE",
      body?: unknown,
    ): Promise<T | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await apiFetch<T>(`/studio${path}`, { method, body });
        invalidate("studio:");
        return result;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "We couldn't save your changes.",
        );
        return null;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [],
  );
  return { run, busy, error, clearError: () => setError(null) };
}

export function dateLabel(value: string | null | undefined) {
  if (!value) return "No date set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export function numberLabel(value: number | null | undefined, unit = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`
    : "Unavailable";
}
