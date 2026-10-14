import { isBlock, type Plan, type SportKey, type Step, type Workout } from "./types";

export const SPORT: Record<SportKey, { label: string; color: string; icon: string }> = {
  running: { label: "Run", color: "var(--run)", icon: "M13 4a2 2 0 100-4 2 2 0 000 4zM9 22l2-7-3-3 2-5 3 2 3 1M7 12l-3 1M10 7l4 1" },
  cycling: { label: "Ride", color: "var(--bike)", icon: "M5 18a3 3 0 100-6 3 3 0 000 6zM19 18a3 3 0 100-6 3 3 0 000 6zM5 15l4-7h5l5 7M9 8l3 7" },
  swimming: { label: "Swim", color: "var(--swim)", icon: "M2 18c2 0 2-1.5 5-1.5S9 18 12 18s2-1.5 5-1.5S19 18 22 18M2 13c2 0 2-1.5 5-1.5S9 13 12 13s2-1.5 5-1.5S19 13 22 13M15 6a2 2 0 100-4 2 2 0 000 4zM8 10l5-3 3 4" },
  strength: { label: "Strength", color: "var(--strength)", icon: "M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" },
};

/** Expand repeats and estimate seconds / metres for one step. */
function stepSeconds(s: Step, sport: SportKey): number {
  if (!s.duration_value) return 0;
  if (s.duration_type === "time") return s.duration_value;
  if (s.duration_type === "distance") {
    const paceSecPerKm = s.target_type === "pace" && s.target_low ? (s.target_low + (s.target_high ?? s.target_low)) / 2 : sport === "cycling" ? 120 : sport === "swimming" ? 1500 : 360;
    return (s.duration_value / 1000) * paceSecPerKm;
  }
  return 0;
}
function stepMeters(s: Step, sport: SportKey): number {
  if (s.duration_type === "distance") return s.duration_value ?? 0;
  if (s.duration_type === "time" && (sport === "running" || sport === "cycling")) {
    const speed = s.target_type === "pace" && s.target_low ? 1000 / ((s.target_low + (s.target_high ?? s.target_low)) / 2) : sport === "cycling" ? 8 : 2.8;
    return (s.duration_value ?? 0) * speed;
  }
  return 0;
}
/** The plain sequence of steps actually performed, with repeats expanded. */
export function flattenSteps(items: Workout["steps"]): Step[] {
  const out: Step[] = [];
  for (const it of items) {
    if (isBlock(it)) for (let r = 0; r < it.repeat; r++) for (const s of it.steps) for (let k = 0; k < s.repeat; k++) out.push(s);
    else for (let k = 0; k < it.repeat; k++) out.push(it);
  }
  return out;
}
export const workoutSeconds = (w: Workout) => flattenSteps(w.steps).reduce((a, s) => a + stepSeconds(s, w.sport), 0);
export const workoutMeters = (w: Workout) => flattenSteps(w.steps).reduce((a, s) => a + stepMeters(s, w.sport), 0);

export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}
/** Exact step length: "20 s", "1 min 30 s", "12 min", "1h05". Totals still use the rounded fmtDuration. */
export function fmtStepTime(sec: number): string {
  const total = Math.round(sec);
  if (total < 60) return `${total} s`;
  if (total < 3600) {
    const m = Math.floor(total / 60), r = total % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  }
  const h = Math.floor(total / 3600), m = Math.round((total % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
export const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);
const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/km`;

export function describeStep(s: Step): string {
  const dur = s.duration_type === "time" && s.duration_value ? fmtStepTime(s.duration_value)
    : s.duration_type === "distance" && s.duration_value ? fmtKm(s.duration_value) : "Until lap press";
  const hi = s.target_high ?? s.target_low;
  let target = "";
  if (s.target_low != null) {
    if (s.target_type === "pace") target = `${pace(Math.max(s.target_low, hi!))} – ${pace(Math.min(s.target_low, hi!))}`;
    else if (s.target_type === "hr_zone") target = `Zone ${s.target_low}`;
    else if (s.target_type === "hr_bpm") target = `${s.target_low}–${hi} bpm`;
    else if (s.target_type === "power_w") target = `${s.target_low}–${hi} W`;
    else if (s.target_type === "cadence") target = `${s.target_low}–${hi} rpm`;
  }
  return [s.repeat > 1 ? `${s.repeat}×` : "", dur, target && `@ ${target}`].filter(Boolean).join(" ");
}

export const INTENSITY: Record<Step["kind"], { label: string; height: number; color: string }> = {
  warmup: { label: "Warm-up", height: 40, color: "#e9b44c" },
  active: { label: "Work", height: 100, color: "var(--accent)" },
  recovery: { label: "Recovery", height: 30, color: "#7fb7a4" },
  rest: { label: "Rest", height: 18, color: "#b9b2a3" },
  cooldown: { label: "Cool-down", height: 36, color: "#8fa8d6" },
};

// --- weeks / phases ---------------------------------------------------------------
export const PHASE_COLORS = ["#ff4d1c", "#e9a23b", "#0f7c6e", "#2a6df4", "#8a5cf6", "#c2417c"];
export const LOAD_LABEL: Record<string, string> = { recovery: "Recovery", easy: "Easy", moderate: "Steady", hard: "Hard", peak: "Peak" };
export const LOAD_LEVEL: Record<string, number> = { recovery: 1, easy: 2, moderate: 3, hard: 4, peak: 5 };

export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d; };
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function phaseIndex(plan: Plan, week: number): number {
  const i = plan.phases.findIndex((p) => week >= p.start_week && week <= p.end_week);
  return i < 0 ? 0 : i;
}
export function weekHours(plan: Plan, week: number): number {
  const ws = plan.workouts.filter((w) => w.week === week);
  const wk = plan.weeks.find((x) => x.week === week);
  return wk?.status === "done" ? ws.reduce((a, w) => a + workoutSeconds(w), 0) / 3600 : wk?.target_hours ?? 0;
}
