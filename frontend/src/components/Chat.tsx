import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { AppState } from "../types";

const STARTERS = [
  "I want to run a half marathon",
  "Build me a 4-week base plan",
  "I'm training for a triathlon",
  "Get me stronger for cycling",
];

interface Props {
  state: AppState;
  pending: string | null;
  busy: boolean;
  building: boolean;
  onSend: (t: string) => void;
  onUpload: (f: File[]) => void;
  onReset: () => void;
  onSettings: () => void;
  onShowPlan: () => void;
}

export default function Chat({ state, pending, busy, building, onSend, onUpload, onReset, onSettings, onShowPlan }: Props) {
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [state.messages.length, pending, busy]);
  useEffect(() => {
    const el = area.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy || building) return;
    setText("");
    onSend(t);
  };
  const pickFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => /\.fit$/i.test(f.name));
    if (files.length) onUpload(files);
  };
  const onlyGreeting = state.messages.length <= 1 && !pending;

  return (
    <section className="chat">
      <header className="brand">
        <div className="mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-9 4 6 3-4 6 7" /></svg>
        </div>
        <h1>AI <em>Trainer</em></h1>
        <div className="spacer" />
        <button className="icon-btn" onClick={onReset} title="New conversation">New</button>
        <button className="icon-btn" onClick={onSettings} title="AI provider & key">Settings</button>
      </header>

      <div className="thread">
        {state.messages.map((m, i) => (
          <motion.div key={i} className={`msg ${m.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {m.role === "assistant" ? (<><div className="who">Coach</div><div className="bubble">{m.content}</div></>) : m.content}
          </motion.div>
        ))}
        {pending && <div className="msg user">{pending}</div>}
        {(busy || building) && <div className="msg assistant"><div className="who">Coach</div><div className="typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>

      {onlyGreeting && (
        <div className="chips">{STARTERS.map((s) => <button key={s} className="chip" onClick={() => onSend(s)} disabled={busy}>{s}</button>)}</div>
      )}

      {state.plan && !building && (
        <button className="plan-pill" onClick={onShowPlan}>
          <span>View your plan</span><b>{state.plan.workouts.length} workouts · {state.plan.weeks.length} weeks</b><i>→</i>
        </button>
      )}

      <div className={`composer ${drag ? "drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pickFiles(e.dataTransfer.files); }}>
        <input ref={fileRef} type="file" accept=".fit,.FIT" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
        <button className="attach" onClick={() => fileRef.current?.click()} title="Upload .fit activity files" aria-label="Upload .fit files">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11l-9 9a6 6 0 01-8.5-8.5l9-9a4 4 0 015.7 5.7l-9 9a2 2 0 01-2.8-2.8l8.3-8.3" /></svg>
          {state.activities > 0 && <span className="count">{state.activities}</span>}
        </button>
        <textarea ref={area} rows={1} disabled={building} value={text} placeholder={building ? "Building your plan…" : drag ? "Drop .fit files here" : "Tell your coach about your goal…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <button className="send" onClick={submit} disabled={busy || building || !text.trim()} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </section>
  );
}
