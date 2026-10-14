/**
 * Browser-side engine with the same surface the UI always used. Everything lives in this tab and
 * localStorage: the conversation, API keys, and Garmin tokens never touch a server of ours. The only
 * server calls are the stateless /api/fit (zip workouts) and /api/garmin (upload) functions.
 */
import type { Activity, AppState, ChatMessage, Plan } from "./types";
import { coachTurn, transcript } from "./engine/coach";
import { readActivity } from "./engine/fitParse";
import { DEFAULT_MODELS, makeComplete, type Provider } from "./engine/llm";
import { athleteContext, buildWeek, planFromOutline } from "./engine/planner";

const GREETING =
  "Hi! I'm your AI coach. Upload some recent .fit activity files with the paperclip (optional but helpful), then tell me what you're training for.";
const K = { conv: "ait.conversation.v1", keys: "ait.keys.v1", prefs: "ait.prefs.v1", garmin: "ait.garmin.tokens.v1" };
const BUILD_WORKERS = 3;

interface Conversation { messages: ChatMessage[]; activities: Activity[]; plan: Plan | null }

const read = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

let conv: Conversation = read(K.conv, { messages: [], activities: [], plan: null });
let building = false;
// the tab was closed mid-build last time: surface unfinished weeks as retryable
conv.plan?.weeks.forEach((w) => { if (w.status === "pending") { w.status = "error"; w.error = "Interrupted - retry this week"; } });

const save = () => write(K.conv, conv);
const keys = () => read<Record<string, string>>(K.keys, {});
const prefs = () => read<{ provider: Provider; model: string }>(K.prefs, { provider: "anthropic", model: "" });

function view(): AppState {
  return JSON.parse(JSON.stringify({
    messages: conv.messages.length ? conv.messages : [{ role: "assistant", content: GREETING }],
    plan: conv.plan,
    activities: conv.activities.length,
    building,
    saved_providers: Object.keys(keys()).filter((k) => keys()[k]),
    prefs: prefs(),
  }));
}

function completer() {
  const p = prefs();
  const apiKey = keys()[p.provider];
  if (!apiKey) throw new Error(`No API key saved for ${p.provider}. Open Settings to add one.`);
  return makeComplete({ provider: p.provider, apiKey, model: p.model });
}

async function buildWeeks(weeks: number[], notes: string | null) {
  building = true;
  const plan = conv.plan!;
  weeks.forEach((n) => { const w = plan.weeks.find((x) => x.week === n); if (w) { w.status = "pending"; w.error = null; } });
  save();
  const queue = [...weeks];
  try {
    const complete = completer();
    const context = athleteContext(conv.activities);
    const convo = transcript(conv.messages);
    const worker = async () => {
      for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
        const wk = plan.weeks.find((x) => x.week === n)!;
        try {
          const ws = await buildWeek(complete, plan, n, context, convo, notes);
          plan.workouts = [...plan.workouts.filter((w) => w.week !== n), ...ws];
          wk.status = "done"; wk.error = null;
        } catch (e) {
          wk.status = "error"; wk.error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        }
        save();
      }
    };
    await Promise.all(Array.from({ length: Math.min(BUILD_WORKERS, weeks.length) }, worker));
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    plan.weeks.forEach((w) => { if (w.status === "pending") { w.status = "error"; w.error = msg; } });
  }
  const done = plan.weeks.filter((w) => w.status === "done").length;
  const failed = plan.weeks.filter((w) => w.status === "error").map((w) => w.week);
  const total = plan.weeks.length;
  conv.messages.push({ role: "assistant", content: failed.length
    ? `I built ${done} of ${total} weeks. Week(s) ${failed.join(", ")} failed - use the Retry button on those weeks.`
    : `Your ${total}-week plan is ready: ${plan.workouts.length} workouts across ${total} weeks. Open any workout to see why it's there. Ask me to change anything.` });
  building = false;
  save();
}

async function postJson(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection.");
  }
}
async function failWith(res: Response): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error ?? `Request failed (${res.status})`);
}

export const api = {
  state: async () => view(),

  async chat(message: string): Promise<AppState> {
    if (building) throw new Error("Your plan is still being built - one moment.");
    const complete = completer();
    conv.messages.push({ role: "user", content: message.trim() });
    try {
      const turn = await coachTurn(complete, conv.messages, athleteContext(conv.activities), conv.plan);
      conv.messages.push({ role: "assistant", content: turn.reply });
      if (turn.outline) {
        conv.plan = planFromOutline(turn.outline);
        save();
        void buildWeeks(conv.plan.weeks.map((w) => w.week), null);
      } else if (turn.regenerate_weeks?.length && conv.plan) {
        const valid = new Set(conv.plan.weeks.map((w) => w.week));
        const weeks = [...new Set(turn.regenerate_weeks)].filter((w) => valid.has(w)).sort((a, b) => a - b);
        if (weeks.length) void buildWeeks(weeks, turn.regenerate_notes);
      }
    } catch (e) {
      conv.messages.pop();
      throw e;
    }
    save();
    return view();
  },

  async retry(weeks: number[]): Promise<AppState> {
    if (building || !conv.plan) throw new Error("Nothing to retry right now.");
    const valid = new Set(conv.plan.weeks.map((w) => w.week));
    const list = weeks.filter((w) => valid.has(w));
    if (list.length) void buildWeeks(list, null);
    return view();
  },

  async reset(): Promise<AppState> {
    conv = { messages: [], activities: [], plan: null };
    building = false;
    save();
    return view();
  },

  async upload(files: File[]): Promise<AppState> {
    let added = 0;
    const skipped: string[] = [];
    for (const f of files) {
      try {
        const a = await readActivity(f);
        if (a) { conv.activities.push(a); added++; } else skipped.push(f.name);
      } catch { skipped.push(f.name); }
    }
    conv.messages.push({ role: "assistant", content: `Uploaded ${added} activity file(s).${skipped.length ? ` Couldn't read: ${skipped.join(", ")}.` : ""} Tell me about your goal when you're ready.` });
    save();
    return view();
  },

  async saveSettings(provider: string, apiKey: string, model: string): Promise<AppState> {
    if (!(provider in DEFAULT_MODELS)) throw new Error("Unknown provider.");
    if (apiKey.trim()) write(K.keys, { ...keys(), [provider]: apiKey.trim() });
    write(K.prefs, { provider, model: model.trim() });
    return view();
  },

  /** `download`: zip of .fit files. `connect`: upload to Garmin Connect (tokens are reused, password isn't kept). */
  async deliver(b: { selected: number[]; method: "download" | "connect"; email?: string; password?: string; push_days?: number }): Promise<{ results: string[] }> {
    const workouts = b.selected.map((i) => conv.plan?.workouts[i]).filter(Boolean);
    if (!workouts.length) throw new Error("Select at least one workout.");
    if (b.method === "download") {
      const res = await postJson("/api/fit", { workouts });
      if (!res.ok) await failWith(res);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: "ai-trainer-workouts.zip" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { results: [`ai-trainer-workouts.zip (${workouts.length} .fit files)`] };
    }
    const res = await postJson("/api/garmin", { workouts, email: b.email ?? "", password: b.password ?? "", tokens: read(K.garmin, ""), push_days: b.push_days ?? 7 });
    if (!res.ok) await failWith(res);
    const data = await res.json();
    if (data.tokens) write(K.garmin, data.tokens);
    return { results: data.results as string[] };
  },

  forgetGarmin() { try { localStorage.removeItem(K.garmin); } catch { /* ignore */ } },
  hasGarminTokens: () => !!read(K.garmin, ""),
};
