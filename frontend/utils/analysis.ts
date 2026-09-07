import { ANALYSIS_PHASE_ORDER, type AnalysisPhaseKey } from "@/types/analysis";

const PHASE_LABELS: Record<AnalysisPhaseKey, string> = {
  ready_position: "READY",
  load: "LOAD",
  set_point: "SET POINT",
  release: "RELEASE",
  follow_through: "FOLLOW THROUGH",
};

export function getPhaseLabel(phaseKey: AnalysisPhaseKey) {
  return PHASE_LABELS[phaseKey];
}

export function getPhaseKeys() {
  return ANALYSIS_PHASE_ORDER;
}

export function isAnalysisPhaseKey(value: string): value is AnalysisPhaseKey {
  return ANALYSIS_PHASE_ORDER.includes(value as AnalysisPhaseKey);
}

export function scoreToGrade(score: number) {
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  return "C-";
}

export function formatAngleLabel(label: string) {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
