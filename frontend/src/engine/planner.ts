import { z } from "zod";
import type { Activity, Plan, Workout } from "../types";
import { askJson, type Complete } from "./llm";
import { WEEK_PROMPT } from "./prompts";
import { OutlineSchema, WeekWorkoutsSchema } from "./schemas";

export type Outline = z.infer<typeof OutlineSchema>;

const DAY = 86_400_000;
const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekDates(start: string, week: number): string[] {
  const first = parse(start) + (week - 1) * 7 * DAY;
  return Array.from({ length: 7 }, (_, i) => fmt(first + i * DAY));
}

export function planFromOutline(o: Outline): Plan {
  const n = o.weeks.length;
  return {
    title: o.title,
    rationale: o.rationale,
    start_date: o.start_date,
    phases: o.phases.map((p) => {
      const s = Math.min(Math.max(p.start_week, 1), n);
      return { ...p, start_week: s, end_week: Math.min(Math.max(p.end_week, s), n) };
    }),
    // renumber 1..N in order so the structure is always consistent
    weeks: o.weeks.map((w, i) => ({ ...w, week: i + 1, status: "pending" as const, error: null })),
    workouts: [],
  };
}

export function planDigest(plan: Plan): string {
  const lines = [`${plan.title} (starts ${plan.start_date})`];
  plan.phases.forEach((p) => lines.push(`Phase ${p.name}: weeks ${p.start_week}-${p.end_week} - ${p.focus}`));
  plan.weeks.forEach((wk) => {
    const names = plan.workouts.filter((w) => w.week === wk.week).map((w) => `${WD[new Date(parse(w.scheduled_for!)).getUTCDay()]} ${w.name}`);
    lines.push(`W${wk.week} [${wk.status}] ${wk.theme} ~${wk.target_hours}h ${wk.load}: ${names.join("; ")}`);
  });
  return lines.join("\n");
}

export function athleteContext(activities: Activity[], now = new Date()): string {
  const weeks = new Map<string, Map<string, [number, number, number]>>();
  for (const a of activities) {
    if (!a.start_time) continue;
    const d = new Date(a.start_time);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const monday = fmt(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY);
    const w = weeks.get(monday) ?? new Map();
    const row = w.get(a.sport) ?? [0, 0, 0];
    row[0] += 1; row[1] += a.distance_m / 1000; row[2] += a.duration_s / 3600;
    w.set(a.sport, row); weeks.set(monday, w);
  }
  const lines = [...weeks.keys()].sort().reverse().slice(0, 8).map((k) =>
    `Week of ${k}: ` + [...weeks.get(k)!].map(([sp, [n, km, h]]) => `${sp}: ${n} sessions, ${km.toFixed(1)} km, ${h.toFixed(1)} h`).join("; "));
  const hrs = activities.map((a) => a.max_hr ?? 0).filter(Boolean);
  if (hrs.length) lines.push(`Highest observed max HR: ${Math.max(...hrs)} bpm`);
  return `Today: ${fmt(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))}\nRecent weekly training load (newest first):\n${lines.join("\n") || "No activity history provided."}`;
}

/** Design one week; the answer is validated to fall inside that week's dates. */
export async function buildWeek(complete: Complete, plan: Plan, week: number, context: string, conversation: string, notes?: string | null): Promise<Workout[]> {
  const outline = plan.weeks.find((w) => w.week === week)!;
  const days = weekDates(plan.start_date!, week);
  const system = WEEK_PROMPT
    .replace("{dates}", days.map((d) => `${d} (${WD[new Date(parse(d)).getUTCDay()]})`).join(", "))
    .replace("{hours}", String(outline.target_hours))
    .replace("{load}", outline.load);
  const overview = plan.weeks.map((w) => `W${w.week}: ${w.theme} (~${w.target_hours}h, ${w.load})`).join("\n");
  const phase = plan.phases.find((p) => p.start_week <= week && week <= p.end_week);
  const user =
    `Athlete data:\n${context}\n\nConversation:\n${conversation}\n\nWhole plan outline:\n${overview}\n\n` +
    (phase ? `Current phase: ${phase.name} - ${phase.focus}\n\n` : "") +
    `Design week ${week}: ${outline.theme}. ${outline.why ?? ""}` +
    (notes ? `\nAthlete's change request for this week: ${notes}` : "");
  let last = "";
  for (let i = 0; i < 3; i++) {
    const res = await askJson(complete, system, user + (last ? `\n\nFix this problem: ${last}` : ""), WeekWorkoutsSchema);
    const bad = res.workouts.filter((w) => !days.includes(w.scheduled_for)).map((w) => w.name);
    if (res.workouts.length && !bad.length) {
      return res.workouts.map((w) => ({ ...w, week })).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)) as Workout[];
    }
    last = res.workouts.length ? `these workouts are outside the allowed dates: ${bad.join(", ")}` : "no workouts returned";
  }
  throw new Error(`Week ${week}: ${last}`);
}
