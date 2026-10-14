import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "./api";
import type { AppState } from "./types";
import Chat from "./components/Chat";
import PlanPanel from "./components/PlanPanel";
import SettingsDialog from "./components/SettingsDialog";

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // optimistic user message while the coach is thinking
  const [pending, setPending] = useState<string | null>(null);

  // mobile: one pane at a time, switched by a bottom tab bar
  const [tab, setTab] = useState<"coach" | "plan">("coach");
  const wasBuilding = useRef(false);
  const hadPlan = useRef(false);
  const [unseen, setUnseen] = useState(false);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setTimeout(() => setError(null), 7000);
  }, []);

  useEffect(() => {
    api.state().then((s) => {
      setState(s);
      if (!s.saved_providers.length) setShowSettings(true);
    }).catch(fail);
  }, [fail]);

  // jump to the plan when the coach starts building it; flag finished plans the user hasn't opened
  useEffect(() => {
    if (!state) return;
    const mobile = window.matchMedia("(max-width: 860px)").matches;
    if (state.building && !wasBuilding.current && mobile) setTab("plan");
    if (!state.building && wasBuilding.current && tab !== "plan") setUnseen(true);
    if (state.plan && !hadPlan.current && tab !== "plan" && !state.building) setUnseen(true);
    wasBuilding.current = state.building;
    hadPlan.current = !!state.plan;
  }, [state, tab]);
  useEffect(() => { if (tab === "plan") setUnseen(false); }, [tab]);

  // while the server builds the plan week by week, poll so weeks appear as they finish
  useEffect(() => {
    if (!state?.building) return;
    const id = setInterval(() => { api.state().then(setState).catch(() => {}); }, 2000);
    return () => clearInterval(id);
  }, [state?.building]);

  const send = async (text: string) => {
    setBusy(true);
    setPending(text);
    try { setState(await api.chat(text)); } catch (e) { fail(e); } finally { setPending(null); setBusy(false); }
  };
  const upload = async (files: File[]) => {
    setBusy(true);
    try { setState(await api.upload(files)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!confirm("Start a new conversation? The current plan will be cleared.")) return;
    try { setState(await api.reset()); } catch (e) { fail(e); }
  };

  if (!state) return null;
  return (
    <div className="app" data-tab={tab}>
      <Chat state={state} pending={pending} busy={busy} building={state.building} onSend={send} onUpload={upload} onReset={reset} onSettings={() => setShowSettings(true)} onShowPlan={() => setTab("plan")} />
      <PlanPanel plan={state.plan} building={state.building} onUpdate={setState} onError={fail} />
      <nav className="tabbar" aria-label="Sections">
        <button className={tab === "coach" ? "on" : ""} onClick={() => setTab("coach")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.5A8 8 0 1121 12z" /></svg>
          <span>Coach</span>
        </button>
        <button className={tab === "plan" ? "on" : ""} onClick={() => setTab("plan")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          <span>Plan</span>
          {(state.building || unseen) && <i className={`badge ${state.building ? "busy" : ""}`} />}
        </button>
        <button onClick={() => setShowSettings(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
          <span>Settings</span>
        </button>
      </nav>
      <AnimatePresence>
        {showSettings && (
          <SettingsDialog state={state} onClose={() => setShowSettings(false)}
            onSaved={(s) => { setState(s); setShowSettings(false); }} onError={fail} />
        )}
        {error && <motion.div className="toast" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>{error}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
