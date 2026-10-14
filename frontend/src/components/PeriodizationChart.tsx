import { useState } from "react";
import type { Plan } from "../types";
import { LOAD_LABEL, PHASE_COLORS, phaseIndex, weekHours } from "../plan-utils";

/** Bar per week (height = hours), colored by phase, phase bands on top. Click a bar to jump to the week. */
export default function PeriodizationChart({ plan }: { plan: Plan }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = plan.weeks.length;
  const hours = plan.weeks.map((w) => weekHours(plan, w.week));
  const max = Math.max(...hours, 1) * 1.15;
  const W = 640, H = 150, top = 30, gap = n > 20 ? 2 : 5;
  const bw = (W - gap * (n - 1)) / n;
  const x = (i: number) => i * (bw + gap);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Weekly training volume by phase">
        {plan.phases.map((p, i) => {
          const x0 = x(p.start_week - 1), x1 = x(p.end_week - 1) + bw;
          const c = PHASE_COLORS[i % PHASE_COLORS.length];
          return (
            <g key={p.name + i}>
              <rect x={x0} y={0} width={x1 - x0} height={5} rx={2.5} fill={c} />
              {x1 - x0 > 52 && <text x={x0} y={20} className="ph-label" fill="var(--ink)">{p.name}</text>}
            </g>
          );
        })}
        {plan.weeks.map((w, i) => {
          const h = Math.max((hours[i] / max) * (H - top), 4);
          const c = PHASE_COLORS[phaseIndex(plan, w.week) % PHASE_COLORS.length];
          const pending = w.status !== "done";
          return (
            <g key={w.week} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}
              onClick={() => document.getElementById(`week-${w.week}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <rect x={x(i)} y={top} width={bw} height={H - top} fill="transparent" />
              <rect x={x(i)} y={H - h} width={bw} height={h} rx={3}
                fill={pending ? "none" : c} stroke={c} strokeWidth={pending ? 1.5 : 0} strokeDasharray={pending ? "3 3" : undefined}
                opacity={hover === null || hover === i ? 1 : 0.45} className={w.status === "pending" ? "pulse" : ""} />
              {(n <= 20 || i % 2 === 0) && <text x={x(i) + bw / 2} y={H + 15} textAnchor="middle" className="wk-label">{w.week}</text>}
            </g>
          );
        })}
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--ink)" strokeWidth={1.5} />
      </svg>
      <div className="chart-tip">
        {hover !== null ? (
          <><b>Week {plan.weeks[hover].week}</b> · {plan.weeks[hover].theme} · {hours[hover].toFixed(1)} h · {LOAD_LABEL[plan.weeks[hover].load]}</>
        ) : <span>Weekly hours — tap a bar to jump to that week</span>}
      </div>
    </div>
  );
}
