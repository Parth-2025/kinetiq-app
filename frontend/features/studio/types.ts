export type Account = {
  role: "athlete" | "coach";
  is_admin: boolean;
  onboarding_complete: boolean;
};
export type Skill = {
  id: string;
  sport: string;
  name: string;
  family: string;
  description: string;
  status: string;
  can_analyze: boolean;
  requirements: string[];
  metrics: string[];
  limitations: string;
};
export type Measurement = {
  id: string;
  created_at: string;
  values: {
    height_cm: number | null;
    wingspan_cm: number | null;
    provenance: string;
  };
};
export type Athlete = {
  id: string;
  name: string;
  sport: string;
  dominant_side: string;
  account_id: string | null;
  measurements: Measurement | null;
  measurement_history?: Measurement[];
  sessions?: TrainingSession[];
};
export type Team = {
  id: string;
  name: string;
  sport: string;
  description: string;
  owner_id: string;
  can_manage?: boolean;
  members?: Athlete[];
  assignments?: Assignment[];
};
export type Assignment = {
  id: string;
  title: string;
  skill_id: string;
  instructions: string;
  team_id: string | null;
  athlete_id: string | null;
  due_at: string | null;
  published: boolean;
  can_manage?: boolean;
  sessions?: TrainingSession[];
};
export type Metric = {
  minimum: number | null;
  maximum: number | null;
  valid_samples: number;
  total_samples: number;
  unit: string;
  status: string;
};
export type MotionFrame = {
  time_ms: number;
  quality?: string;
  points: (number[] | null)[];
  elbow_flexion: number | null;
  knee_flexion: number | null;
};
export type Feedback = {
  id: string;
  coach_id: string;
  can_edit?: boolean;
  session_id: string;
  body: string;
  published: boolean;
  created_at: string;
};
export type TrainingSession = {
  id: string;
  athlete_id: string;
  athlete_name: string;
  skill_id: string;
  skill_name: string;
  status: string;
  created_at: string;
  error: string | null;
  summary: Record<string, Metric>;
  can_manage?: boolean;
  shared_team_ids?: string[];
  shareable_teams?: { id: string; name: string }[];
  source: Record<string, unknown>;
  feedback?: Feedback[];
  analysis?: {
    shot_candidates?: import("./shot-candidates").ShotCandidateSummary;
    version: string;
    side: string;
    duration_ms: number;
    frames: MotionFrame[];
    summary: Record<string, Metric>;
    limitations: string[];
    timestamp_mode: string;
    quality_counts?: Record<string, number>;
  };
};
export type RosterEntry = {
  athlete_id: string;
  jersey: string;
  side: "home" | "away";
};
export type PracticeEvent = {
  id: string;
  athlete_id: string | null;
  data: {
    kind: string;
    timestamp_seconds: number;
    outcome: string;
    note: string;
    provenance: string;
  };
};
export type Practice = {
  id: string;
  title: string;
  team_id: string;
  notes: string;
  scheduled_at: string | null;
  roster: RosterEntry[];
  status: string;
  created_at: string;
  events?: PracticeEvent[];
  report?: {
    provenance: string;
    recorded_shots: number;
    known_outcomes: number;
    makes: number;
    make_percentage: number | null;
    tracking_status: string;
  };
};
export type Device = {
  id: string;
  name: string;
  serial: string;
  kind: string;
  athlete_id: string | null;
  connection_status: string;
};
export type Overview = {
  account: Account;
  name: string;
  athletes: Athlete[];
  teams: Team[];
  sessions: TrainingSession[];
  assignments: Assignment[];
  practices: Practice[];
  feedback: Feedback[];
};
