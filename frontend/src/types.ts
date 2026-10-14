export type SportKey = "running" | "cycling" | "swimming" | "strength";
export type StepKind = "warmup" | "active" | "recovery" | "rest" | "cooldown";
export type TargetType = "none" | "hr_zone" | "hr_bpm" | "pace" | "power_w" | "cadence";

export interface Step {
  kind: StepKind;
  duration_type: "time" | "distance" | "open";
  duration_value: number | null;
  target_type: TargetType;
  target_low: number | null;
  target_high: number | null;
  repeat: number;
  notes: string | null;
  why: string | null;
}
export interface RepeatBlock {
  repeat: number;
  steps: Step[];
}
export const isBlock = (x: Step | RepeatBlock): x is RepeatBlock => Array.isArray((x as RepeatBlock).steps);

export interface Activity {
  sport: string;
  start_time: string | null;
  duration_s: number;
  distance_m: number;
  avg_hr: number | null;
  max_hr: number | null;
  source_file: string | null;
}
export interface Workout {
  name: string;
  sport: SportKey;
  scheduled_for: string | null;
  week: number | null;
  description: string | null;
  why: string | null;
  steps: (Step | RepeatBlock)[];
}
export interface Phase { name: string; start_week: number; end_week: number; focus: string; why: string }
export interface WeekOutline {
  week: number; theme: string; why: string | null; target_hours: number;
  load: "recovery" | "easy" | "moderate" | "hard" | "peak";
  status: "pending" | "done" | "error"; error: string | null;
}
export interface Plan {
  title: string;
  rationale: string | null;
  start_date: string | null;
  phases: Phase[];
  weeks: WeekOutline[];
  workouts: Workout[];
}
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AppState {
  messages: ChatMessage[];
  plan: Plan | null;
  activities: number;
  building: boolean;
  saved_providers: string[];
  prefs: { provider: string; model: string };
}
