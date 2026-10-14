import type { Plan } from "../types";
import { SPORT, addDays, fmtDuration, fmtKm, phaseIndex, PHASE_COLORS, workoutMeters, workoutSeconds } from "../plan-utils";

interface Props {
  plan: Plan;
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
  toggle: (i: number) => void;
  busy: boolean;
  retry: (weeks: number[]) => void;
}

/** Compact checklist: one row per workout, tuned for deciding what goes to the watch. */
export default function SimpleView({ plan, selected, setSelected, toggle, busy, retry }: Props) {
  const all = plan.workouts.map((_, i) => i);
  const sports = [...new Set(plan.workouts.map((w) => w.sport))];

  const idsOfWeek = (wk: number) => all.filter((i) => plan.workouts[i].week === wk);
  const setMany = (ids: number[], on: boolean) => {
    const n = new Set(selected);
    ids.forEach((i) => (on ? n.add(i) : n.delete(i)));
    setSelected(n);
  };
  const sportState = (sp: string) => {
    const ids = all.filter((i) => plan.workouts[i].sport === sp);
    return { ids, on: ids.length > 0 && ids.every((i) => selected.has(i)) };
  };

  const chosen = all.filter((i) => selected.has(i)).map((i) => plan.workouts[i]);
  const sec = chosen.reduce((a, w) => a + workoutSeconds(w), 0);
  const m = chosen.reduce((a, w) => a + workoutMeters(w), 0);
  const dates = chosen.map((w) => w.scheduled_for).filter(Boolean).sort() as string[];
  const fmtD = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <div className="simple">
      <div className="going">
        <div>
          <div className="eyebrow">Going to your watch</div>
          <div className="going-big"><b>{chosen.length}</b> <span>of {all.length} workouts</span></div>
          <div className="going-meta">
            {chosen.length > 0 ? <>{fmtDuration(sec)}{m > 0 && <> · ~{fmtKm(m)}</>}{dates.length > 0 && <> · {fmtD(dates[0])} → {fmtD(dates[dates.length - 1])}</>}</> : "Nothing selected yet"}
          </div>
        </div>
        <div className="going-tools">
          <button className="chip-l" onClick={() => setSelected(new Set(all))}>Select all</button>
          <button className="chip-l" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      </div>

      <div className="sport-filters" role="group" aria-label="Select by sport">
        {sports.map((sp) => {
          const { ids, on } = sportState(sp);
          return (
            <button key={sp} className={`sport-chip ${on ? "on" : ""}`} style={{ ["--c" as string]: SPORT[sp].color }} onClick={() => setMany(ids, !on)} aria-pressed={on}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={SPORT[sp].icon} /></svg>
              {SPORT[sp].label} <em>{ids.length}</em>
            </button>
          );
        })}
      </div>

      {plan.weeks.map((wk) => {
        const ids = idsOfWeek(wk.week).sort((a, b) => (plan.workouts[a].scheduled_for ?? "").localeCompare(plan.workouts[b].scheduled_for ?? ""));
        const count = ids.filter((i) => selected.has(i)).length;
        const state = ids.length === 0 ? "none" : count === ids.length ? "all" : count === 0 ? "off" : "some";
        const color = PHASE_COLORS[phaseIndex(plan, wk.week) % PHASE_COLORS.length];
        const start = plan.start_date ? addDays(plan.start_date, (wk.week - 1) * 7) : null;
        return (
          <section className="srow-group" key={wk.week} style={{ ["--pc" as string]: color }}>
            <header>
              <input type="checkbox" disabled={!ids.length} checked={state === "all"}
                ref={(el) => { if (el) el.indeterminate = state === "some"; }}
                onChange={() => setMany(ids, state !== "all")} aria-label={`Select all of week ${wk.week}`} />
              <b>Week {wk.week}</b>
              <span className="wt">{wk.theme}</span>
              <span className="cnt">{start ? start.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}{ids.length ? ` · ${count}/${ids.length}` : ""}</span>
            </header>
            {wk.status === "pending" && <div className="srow muted">Designing this week…</div>}
            {wk.status === "error" && <div className="srow err">⚠ {wk.error}<button className="chip-l" disabled={busy} onClick={() => retry([wk.week])}>Retry</button></div>}
            {ids.map((i) => {
              const w = plan.workouts[i];
              const d = w.scheduled_for ? new Date(w.scheduled_for + "T00:00:00") : null;
              const s = workoutSeconds(w), mm = workoutMeters(w);
              const on = selected.has(i);
              return (
                <label key={i} className={`srow ${on ? "on" : ""}`} style={{ ["--c" as string]: SPORT[w.sport].color }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(i)} />
                  <span className="sd">{d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) : "TBD"}</span>
                  <span className="si"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={SPORT[w.sport].icon} /></svg></span>
                  <span className="sn">{w.name}</span>
                  <span className="sm">{s > 0 ? fmtDuration(s) : ""}{mm > 0 ? ` · ${fmtKm(mm)}` : ""}</span>
                </label>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
