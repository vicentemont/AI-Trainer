import { useState } from "react";
import { motion } from "motion/react";
import { api } from "../api";
import type { AppState } from "../types";

const PROVIDERS = [
  { id: "anthropic", label: "Claude", hint: "console.anthropic.com" },
  { id: "openai", label: "OpenAI", hint: "platform.openai.com" },
  { id: "gemini", label: "Gemini", hint: "aistudio.google.com" },
];

interface Props { state: AppState; onClose: () => void; onSaved: (s: AppState) => void; onError: (e: unknown) => void }

export default function SettingsDialog({ state, onClose, onSaved, onError }: Props) {
  const [provider, setProvider] = useState(state.prefs.provider);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(state.prefs.model);
  const has = state.saved_providers.includes(provider);
  const info = PROVIDERS.find((p) => p.id === provider)!;

  const save = async () => {
    try { onSaved(await api.saveSettings(provider, key, model)); } catch (e) { onError(e); }
  };
  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="dialog" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <h3>Choose your AI</h3>
        <p className="sub">Use your own key. It stays in this browser and is only sent to the provider you pick. Anyone using this device could see it, so avoid shared computers.</p>
        <div className="seg">{PROVIDERS.map((p) => <button key={p.id} className={p.id === provider ? "on" : ""} onClick={() => setProvider(p.id)}>{p.label}{state.saved_providers.includes(p.id) ? " ✓" : ""}</button>)}</div>
        <div className="field">
          <label>API key {has && <span style={{ fontWeight: 400, color: "var(--muted)" }}>— saved, leave empty to keep</span>}</label>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={has ? "••••••••••••" : `Get one at ${info.hint}`} />
        </div>
        <div className="field"><label>Model (optional)</label><input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Provider default" /></div>
        <div className="row">
          {state.saved_providers.length > 0 && <button className="btn ghost" onClick={onClose}>Cancel</button>}
          <button className="btn" onClick={save} disabled={!has && !key.trim()}>Save</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
