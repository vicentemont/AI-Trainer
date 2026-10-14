import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { api } from "../api";
import type { Plan, WeekOutline } from "../types";
import { LOAD_LABEL, LOAD_LEVEL, PHASE_COLORS, SPORT, addDays, fmtDuration, iso, phaseIndex, weekHours, workoutSeconds } from "../plan-utils";
import WorkoutCard from "./WorkoutCard";
import DeliverDialog from "./DeliverDialog";
import PeriodizationChart from "./PeriodizationChart";
import SimpleView from "./SimpleView";

interface Props { plan: Plan | null; building: boolean; onUpdate: (s: import("../types").AppState) => void; onError: (e: unknown) => void }

export default function PlanPanel({ plan, building, onUpdate, onError }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deliver, setDeliver] = useState(false);
  const [mode, setMode] = useState<"detailed" | "simple">(() => {
    try { return localStorage.getItem("plan-view") === "simple" ? "simple" : "detailed"; } catch { return "detailed"; }
  });
  const pick = (m: "detailed" | "simple") => { setMode(m); try { localStorage.setItem("plan-view", m); } catch { /* ignore */ } };

  // newly built workouts are selected by default; removed ones are dropped
  const signature = plan ? plan.workouts.map((w) => w.name + w.scheduled_for).join("|") : "";
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<number>();
      plan?.workouts.forEach((_, i) => next.add(i));
      prev.size && plan && prev.forEach((i) => { if (i >= plan.workouts.length) next.delete(i); });
      return next;
    });
  }, [signature]); // eslint-disable-line

  const totals = useMemo(() => {
    if (!plan) return null;
    const bySport: Record<string, number> = {};
    plan.workouts.forEach((w) => (bySport[w.sport] = (bySport[w.sport] ?? 0) + 1));
    const done = plan.weeks.filter((w) => w.status === "done").length;
    return { bySport, done, seconds: plan.workouts.reduce((a, w) => a + workoutSeconds(w), 0) };
  }, [plan]);

  if (!plan || !totals) return <Empty />;
  const toggle = (i: number) => setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const retry = async (weeks: number[]) => { try { onUpdate(await api.retry(weeks)); } catch (e) { onError(e); } };
  const end = plan.start_date ? addDays(plan.start_date, plan.weeks.length * 7 - 1) : null;
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <section className="plan">
      <div className="viewbar">
        <div className="seg view-seg" role="tablist" aria-label="Plan view">
          <button role="tab" aria-selected={mode === "detailed"} className={mode === "detailed" ? "on" : ""} onClick={() => pick("detailed")}>Detailed</button>
          <button role="tab" aria-selected={mode === "simple"} className={mode === "simple" ? "on" : ""} onClick={() => pick("simple")}>Simple · select</button>
        </div>
      </div>
      <div className="plan-scroll">
        {mode === "simple" && (<>
          <div className="eyebrow">{plan.weeks.length}-week plan</div>
          <h2 className="simple-title">{plan.title}</h2>
          {building && <div className="progress"><div style={{ width: `${(totals.done / plan.weeks.length) * 100}%` }} /><span>Designing weeks… {totals.done}/{plan.weeks.length}</span></div>}
          <SimpleView plan={plan} selected={selected} setSelected={setSelected} toggle={toggle} busy={building} retry={retry} />
        </>)}
        {mode === "detailed" && (<>
        <motion.header className="hero" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="eyebrow">
            {plan.weeks.length}-week plan{plan.start_date && end ? ` · ${fmt(new Date(plan.start_date + "T00:00:00"))} → ${fmt(end)}` : ""}
          </div>
          <h2>{plan.title}</h2>
          {plan.rationale && <p className="rationale">{plan.rationale}</p>}
          <div className="stats">
            <div className="stat"><b>{plan.weeks.length}</b><span>weeks</span></div>
            <div className="stat"><b>{plan.workouts.length}</b><span>workouts</span></div>
            <div className="stat"><b>{fmtDuration(totals.seconds)}</b><span>total time</span></div>
            {Object.entries(totals.bySport).map(([k, n]) => (
              <div key={k} className="stat sport" style={{ ["--c" as string]: SPORT[k as keyof typeof SPORT].color }}><b>{n}</b><span>{SPORT[k as keyof typeof SPORT].label.toLowerCase()}</span></div>
            ))}
          </div>
          {building && (
            <div className="progress"><div style={{ width: `${(totals.done / plan.weeks.length) * 100}%` }} />
              <span>Designing weeks… {totals.done}/{plan.weeks.length}</span></div>
          )}
        </motion.header>

        <PeriodizationChart plan={plan} />

        <div className="phases">
          {plan.phases.map((p, i) => (
            <motion.div key={p.name + i} className="phase" style={{ ["--c" as string]: PHASE_COLORS[i % PHASE_COLORS.length] }}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }}>
              <div className="eyebrow">Weeks {p.start_week}{p.end_week > p.start_week ? `–${p.end_week}` : ""}</div>
              <h4>{p.name}</h4>
              <p className="focus">{p.focus}</p>
              <p className="why">{p.why}</p>
            </motion.div>
          ))}
        </div>

        {plan.weeks.map((wk) => (
          <Week key={wk.week} plan={plan} wk={wk} selected={selected} toggle={toggle} retry={retry} busy={building} />
        ))}
        </>)}
      </div>
      <div className="bar">
        <span className="sel">{selected.size} of {plan.workouts.length} selected</span>
        <button className="btn accent" disabled={!selected.size || building} onClick={() => setDeliver(true)}>Send to my watch →</button>
      </div>
      {deliver && <DeliverDialog selected={[...selected].sort((a, b) => a - b)} onClose={() => setDeliver(false)} onError={onError} />}
    </section>
  );
}

function Week({ plan, wk, selected, toggle, retry, busy }: {
  plan: Plan; wk: WeekOutline; selected: Set<number>; toggle: (i: number) => void; retry: (w: number[]) => void; busy: boolean;
}) {
  const items = plan.workouts.map((w, index) => ({ w, index })).filter((e) => e.w.week === wk.week)
    .sort((a, b) => (a.w.scheduled_for ?? "").localeCompare(b.w.scheduled_for ?? ""));
  const color = PHASE_COLORS[phaseIndex(plan, wk.week) % PHASE_COLORS.length];
  const phase = plan.phases[phaseIndex(plan, wk.week)];
  const days = plan.start_date ? Array.from({ length: 7 }, (_, i) => addDays(plan.start_date!, (wk.week - 1) * 7 + i)) : [];
  const hrs = weekHours(plan, wk.week);

  return (
    <div className="week" id={`week-${wk.week}`} style={{ ["--pc" as string]: color }}>
      <div className="week-head">
        <div className="wnum">{String(wk.week).padStart(2, "0")}</div>
        <div className="wtitle">
          <div className="eyebrow"><i className="dot" />{phase?.name}{days[0] ? ` · ${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</div>
          <h3>{wk.theme}</h3>
        </div>
        <div className="wmeta">
          <span className="load" title={`Load: ${LOAD_LABEL[wk.load]}`}>
            {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= LOAD_LEVEL[wk.load] ? "on" : ""} />)}<em>{LOAD_LABEL[wk.load]}</em>
          </span>
          <b>{hrs.toFixed(1)} h</b>
        </div>
      </div>
      {wk.why && <p className="week-why">{wk.why}</p>}
      {days.length > 0 && (
        <div className="strip">
          {days.map((d) => {
            const ws = items.filter((e) => e.w.scheduled_for === iso(d));
            return (
              <div key={iso(d)} className={`day ${ws.length ? "has" : ""}`}>
                <span>{d.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                <b>{d.getDate()}</b>
                <div className="dots">{ws.length ? ws.map((e, i) => <i key={i} style={{ background: SPORT[e.w.sport].color }} title={e.w.name} />) : <em>rest</em>}</div>
              </div>
            );
          })}
        </div>
      )}
      {wk.status === "pending" && (
        <div className="skeletons">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.15}s` }} />)}<span>Designing this week…</span></div>
      )}
      {wk.status === "error" && (
        <div className="week-error"><span>⚠ {wk.error ?? "This week could not be built."}</span><button className="btn ghost" disabled={busy} onClick={() => retry([wk.week])}>Retry week</button></div>
      )}
      {items.map(({ w, index }, k) => <WorkoutCard key={index + w.name} w={w} selected={selected.has(index)} onToggle={() => toggle(index)} delay={k * 0.05} />)}
    </div>
  );
}

function Empty() {
  return (
    <section className="plan">
      <div className="empty">
        <div>
          <svg width="120" height="64" viewBox="0 0 120 64" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round">
            <path d="M4 52c20 0 20-34 40-34s18 28 36 28 24-24 36-24" strokeDasharray="2 7" />
            <circle cx="4" cy="52" r="5" fill="var(--accent)" stroke="none" /><circle cx="116" cy="22" r="5" fill="var(--ink)" stroke="none" />
          </svg>
          <div className="eyebrow">Your plan appears here</div>
          <h2>Let's build it together</h2>
          <p>Chat with your coach on the left. Once it knows enough, your plan fills this side week by week — with the reasoning behind every session.</p>
          <div className="checklist">
            <span>Your goal & event date</span><span>Days and time you can train</span><span>Sports, strength access, injuries</span>
          </div>
        </div>
      </div>
    </section>
  );
}
