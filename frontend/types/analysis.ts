export const ANALYSIS_PHASE_ORDER = [
  "ready_position",
  "load",
  "set_point",
  "release",
  "follow_through",
] as const;

export type AnalysisPhaseKey = (typeof ANALYSIS_PHASE_ORDER)[number];

export interface ResourceLink {
  label: string;
  url: string;
}

export interface AngleMeasurement {
  value: number;
  ideal: string;
  score: number;
}

export interface PhaseImageSet {
  user_frame: string | null;
  ideal_frame: string | null;
}

export interface PhaseResult {
  emoji: string;
  title: string;
  description: string;
  score: number;
  status: string;
  feedback: string;
  resources: ResourceLink[];
  angles_measured: Record<string, AngleMeasurement>;
}

export interface AnalysisResult {
  overall_score: number;
  priority: string;
  phases: Partial<Record<AnalysisPhaseKey, PhaseResult>>;
  pose_gif?: string;
  phase_images?: Partial<Record<AnalysisPhaseKey, PhaseImageSet>>;
}

export interface VideoAssetMetadata {
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

export interface AnalysisSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: VideoAssetMetadata;
  analysis: AnalysisResult;
}
