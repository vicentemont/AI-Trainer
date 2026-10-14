import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isBlock, type Step, type Workout } from "../types";
import { INTENSITY, SPORT, describeStep, flattenSteps, fmtDuration, fmtKm, workoutMeters, workoutSeconds } from "../plan-utils";

interface Props { w: Workout; selected: boolean; onToggle: () => void; delay: number }

const weight = (s: Step) =>
  Math.max(s.duration_value ? (s.duration_type === "time" ? s.duration_value : s.duration_value * 0.36) : 60, 30);

export default function WorkoutCard({ w, selected, onToggle, delay }: Props) {
  const [open, setOpen] = useState(false);
  const sport = SPORT[w.sport];
  const d = w.scheduled_for ? new Date(w.scheduled_for + "T00:00:00") : null;
  const sec = workoutSeconds(w), m = workoutMeters(w);
  const expanded = flattenSteps(w.steps);
  const total = expanded.reduce((a, s) => a + weight(s), 0);
  const kinds = [...new Set(expanded.map((s) => s.kind))];

  return (
    <motion.article className={`card ${selected ? "" : "off"} ${open ? "open" : ""}`} style={{ ["--c" as string]: sport.color }}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.3 }}>
      <div className="date">
        <b>{d ? d.getDate() : "–"}</b>
        <span>{d ? d.toLocaleDateString(undefined, { weekday: "short" }) : "TBD"}</span>
        <div className="sport-badge"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={sport.icon} /></svg></div>
      </div>
      <button className="card-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="card-title">{w.name}</div>
        <div className="meta">
          <span>{sport.label}</span>
          {sec > 0 && <span>{fmtDuration(sec)}</span>}
          {m > 0 && <span>~{fmtKm(m)}</span>}
          <span className="more">{open ? "Hide details" : "Why & details"} {open ? "▴" : "▾"}</span>
        </div>
        {!open && <div className="mini-profile" aria-hidden>
          {expanded.map((s, i) => <div key={i} style={{ flex: weight(s) / total, height: `${Math.max(INTENSITY[s.kind].height, 22)}%`, background: INTENSITY[s.kind].color }} />)}
        </div>}
        {!open && w.why && <p className="why-line">{w.why}</p>}
      </button>
      <label className="pick" title="Include when sending to the watch">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Include ${w.name}`} />
      </label>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="profile" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div className="inner">
              {w.description && <p className="desc">{w.description}</p>}
              {w.why && <div className="why-box"><div className="eyebrow">Why this session</div><p>{w.why}</p></div>}
              <div className="bars" aria-hidden>
                {expanded.map((s, i) => <div key={i} title={INTENSITY[s.kind].label} style={{ flex: weight(s) / total, height: `${INTENSITY[s.kind].height}%`, background: INTENSITY[s.kind].color }} />)}
              </div>
              <div className="legend">{kinds.map((k) => <span key={k}><i style={{ background: INTENSITY[k].color }} />{INTENSITY[k].label}</span>)}</div>
              <ol className="steps">
                {w.steps.map((item, i) => isBlock(item) ? (
                  <li key={i} className="block">
                    <div className="block-head">Repeat {item.repeat}×</div>
                    <ol>{item.steps.map((s, j) => <StepRow key={j} s={s} />)}</ol>
                  </li>
                ) : <StepRow key={i} s={item} />)}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function StepRow({ s }: { s: Step }) {
  return (
    <li>
      <i style={{ background: INTENSITY[s.kind].color }} />
      <div>
        <div className="step-top"><em>{INTENSITY[s.kind].label}</em><span>{describeStep(s)}</span></div>
        {(s.why || s.notes) && <p className="step-why">{s.why ?? s.notes}</p>}
      </div>
    </li>
  );
}
