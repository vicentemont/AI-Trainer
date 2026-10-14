import { beforeEach, describe, expect, it, vi } from "vitest";
import { askJson } from "./llm";
import { buildWeek, planFromOutline, weekDates } from "./planner";
import { WeekWorkoutsSchema } from "./schemas";

const step = { duration_value: 600 };
const run = (date: string, name = "Run") => ({ name, sport: "running", scheduled_for: date, steps: [step] });

describe("schemas + askJson", () => {
  it("parses repeat blocks before plain steps and retries invalid JSON", async () => {
    const answers = ["nope", JSON.stringify({ workouts: [{ ...run("2026-10-20"), steps: [{ repeat: 4, steps: [{ duration_value: 60 }, { kind: "recovery", duration_value: 30 }] }, step] }] })];
    const out = await askJson(async () => answers.shift()!, "s", "u", WeekWorkoutsSchema);
    const [block, plain] = out.workouts[0].steps as any[];
    expect(block.steps).toHaveLength(2);
    expect(plain.steps).toBeUndefined();
    expect(plain.kind).toBe("active");
  });
});

describe("planner", () => {
  const outline = planFromOutline({
    title: "T", rationale: "R", start_date: "2026-10-19",
    phases: [{ name: "Base", start_week: 1, end_week: 99, focus: "f", why: "w" }],
    weeks: [1, 2, 3].map((n) => ({ week: 7, theme: `W${n}`, why: null, target_hours: 4, load: "easy" as const })),
  });
  it("renumbers weeks and clamps phases", () => {
    expect(outline.weeks.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(outline.phases[0].end_week).toBe(3);
  });
  it("computes week dates from the Monday start", () => {
    expect(weekDates("2026-10-19", 2)[0]).toBe("2026-10-26");
  });
  it("rejects workouts outside the week and retries", async () => {
    const answers = [{ workouts: [run("2026-11-05")] }, { workouts: [run("2026-10-27")] }];
    const ws = await buildWeek(async () => JSON.stringify(answers.shift()), outline, 2, "ctx", "convo");
    expect(ws[0].scheduled_for).toBe("2026-10-27");
    expect(ws[0].week).toBe(2);
  });
  it("gives up after 3 bad attempts", async () => {
    await expect(buildWeek(async () => JSON.stringify({ workouts: [] }), outline, 1, "c", "c")).rejects.toThrow(/Week 1/);
  });
});

describe("api (browser engine)", () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it("converses, builds every promised week, and delivers", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push(url);
      if (url.includes("anthropic")) {
        const body = JSON.parse(init.body);
        let text: string;
        if (body.system.includes("ONE week")) {
          const first = body.system.match(/these dates: (\d{4}-\d{2}-\d{2})/)[1];
          text = JSON.stringify({ workouts: [run(first)] });
        } else if (body.messages[0].content.includes("16 weeks")) {
          text = JSON.stringify({ reply: "Building now.", outline: { title: "P", rationale: "R", start_date: "2026-10-19",
            phases: [{ name: "Base", start_week: 1, end_week: 5, focus: "f", why: "w" }],
            weeks: [1, 2, 3, 4, 5].map((n) => ({ week: n, theme: `W${n}`, target_hours: 3, load: "easy" })) } });
        } else text = JSON.stringify({ reply: "What's your goal?" });
        return new Response(JSON.stringify({ content: [{ text }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: ["ok: workoutId=1"], tokens: "tok" }), { status: 200 });
    }));
    const { api } = await import("../api");
    await expect(api.chat("hi")).rejects.toThrow(/API key/);
    await api.saveSettings("anthropic", "sk-test", "");
    expect((await api.chat("hello")).plan).toBeNull();
    await api.chat("16 weeks please");
    let s = await api.state();
    for (let i = 0; i < 100 && s.building; i++) { await new Promise((r) => setTimeout(r, 20)); s = await api.state(); }
    expect(s.plan!.weeks).toHaveLength(5);
    expect(s.plan!.weeks.every((w) => w.status === "done")).toBe(true);
    expect(s.plan!.workouts.map((w) => w.week).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(s.messages.at(-1)!.content).toMatch(/5-week plan is ready/);
    expect(calls.filter((u) => u.includes("anthropic")).length).toBe(2 + 5);

    const res = await api.deliver({ selected: [0], method: "connect", email: "a@b.c", password: "pw" });
    expect(res.results[0]).toContain("workoutId");
    expect(api.hasGarminTokens()).toBe(true);
    const sent = JSON.parse((fetch as any).mock.calls.at(-1)[1].body);
    expect(sent.password).toBe("pw");
    expect(JSON.stringify(localStorage)).not.toContain("pw\"");
  });
});

import { describeStep, fmtStepTime } from "../plan-utils";
describe("step time formatting", () => {
  it("never rounds short steps down to 0 min", () => {
    expect(fmtStepTime(20)).toBe("20 s");
    expect(fmtStepTime(90)).toBe("1 min 30 s");
    expect(fmtStepTime(720)).toBe("12 min");
    expect(fmtStepTime(3900)).toBe("1h05");
    expect(describeStep({ kind: "active", duration_type: "time", duration_value: 20, target_type: "none", target_low: null, target_high: null, repeat: 1, notes: null, why: null })).toBe("20 s");
  });
});
