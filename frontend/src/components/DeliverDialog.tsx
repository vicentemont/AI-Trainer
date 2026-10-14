import { useState } from "react";
import { motion } from "motion/react";
import { api } from "../api";

interface Props { selected: number[]; onClose: () => void; onError: (e: unknown) => void }

export default function DeliverDialog({ selected, onClose, onError }: Props) {
  const [method, setMethod] = useState<"folder" | "connect">("folder");
  const [folder, setFolder] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pushNow, setPushNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);

  const go = async () => {
    setBusy(true);
    try { setResults((await api.deliver({ selected, method, folder, email, password, push_days: pushNow ? 7 : 0 })).results); }
    catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <motion.div className="dialog" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} onClick={(e) => e.stopPropagation()}>
        {results ? (<>
          <h3>Done 🎉</h3><p className="sub">{results.length} workout{results.length > 1 ? "s" : ""} delivered.</p>
          <div className="ok-list">{results.map((r) => <div key={r}>{r}</div>)}</div>
          {method === "folder" && <p className="note" style={{ marginTop: 12 }}>Plug in your watch and copy these files to <b>GARMIN/NewFiles</b>.</p>}
          <div className="row"><button className="btn" onClick={onClose}>Close</button></div>
        </>) : (<>
          <h3>Send {selected.length} workout{selected.length > 1 ? "s" : ""}</h3>
          <p className="sub">Choose how they reach your Garmin.</p>
          <div className="seg"><button className={method === "folder" ? "on" : ""} onClick={() => setMethod("folder")}>Save .fit files</button><button className={method === "connect" ? "on" : ""} onClick={() => setMethod("connect")}>Garmin Connect</button></div>
          {method === "folder" ? (<>
            <div className="field"><label>Folder (optional)</label><input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/.ai-trainer-garmin/workouts" /></div>
            <p className="note">Safest option — no login. Copy the files to the watch's <b>GARMIN/NewFiles</b> folder over USB.</p>
          </>) : (<>
            <div className="field"><label>Garmin email</label><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
            <div className="field"><label>Garmin password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
            <label className="check"><input type="checkbox" checked={pushNow} onChange={(e) => setPushNow(e.target.checked)} /> Also send the next 7 days straight to my watch</label>
            <p className="note">Unofficial connection, runs on your computer only; your password is not saved. Accounts with two-step verification may not work yet. Try a test account first.</p>
          </>)}
          <div className="row"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn accent" onClick={go} disabled={busy || (method === "connect" && (!email || !password))}>{busy ? "Sending…" : "Send"}</button></div>
        </>)}
      </motion.div>
    </motion.div>
  );
}
