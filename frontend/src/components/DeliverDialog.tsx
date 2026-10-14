import { useState } from "react";
import { motion } from "motion/react";
import { api } from "../api";

interface Props { selected: number[]; onClose: () => void; onError: (e: unknown) => void }

export default function DeliverDialog({ selected, onClose, onError }: Props) {
  const [method, setMethod] = useState<"download" | "connect">("download");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pushNow, setPushNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);
  const [remembered, setRemembered] = useState(api.hasGarminTokens());

  const go = async () => {
    setBusy(true);
    try {
      setResults((await api.deliver({ selected, method, email, password, push_days: pushNow ? 7 : 0 })).results);
      setPassword("");
      setRemembered(api.hasGarminTokens());
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const canSend = method === "download" || remembered || (email && password);
  const n = selected.length;
  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <motion.div className="dialog" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} onClick={(e) => e.stopPropagation()}>
        {results ? (<>
          <h3>Done 🎉</h3><p className="sub">{method === "download" ? "Your files were downloaded." : `${results.length} workout${results.length > 1 ? "s" : ""} sent.`}</p>
          <div className="ok-list">{results.map((r) => <div key={r}>{r}</div>)}</div>
          {method === "download" && <p className="note" style={{ marginTop: 12 }}>Unzip, plug in your watch and copy the .fit files to <b>GARMIN/NewFiles</b> (or <b>GARMIN/Workouts</b>). They appear under Training &gt; Workouts.</p>}
          <div className="row"><button className="btn" onClick={onClose}>Close</button></div>
        </>) : (<>
          <h3>Send {n} workout{n > 1 ? "s" : ""}</h3>
          <p className="sub">Choose how they reach your Garmin.</p>
          <div className="seg"><button className={method === "download" ? "on" : ""} onClick={() => setMethod("download")}>Download .fit</button><button className={method === "connect" ? "on" : ""} onClick={() => setMethod("connect")}>Garmin Connect</button></div>
          {method === "download" ? (
            <p className="note">Safest option, no login. You get a zip of .fit workout files to copy to the watch over USB.</p>
          ) : (<>
            {remembered ? (
              <p className="note">You're signed in from this browser. <button className="link" onClick={() => { api.forgetGarmin(); setRemembered(false); }}>Use a different account</button></p>
            ) : (<>
              <div className="field"><label>Garmin email</label><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
              <div className="field"><label>Garmin password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
            </>)}
            <label className="check"><input type="checkbox" checked={pushNow} onChange={(e) => setPushNow(e.target.checked)} /> Also send the next 7 days straight to my watch</label>
            <p className="note"><b>Experimental.</b> Your login goes through this site's server only for this request and is not stored; afterwards only a session token stays in this browser. Garmin may block the connection, and accounts with two-step verification aren't supported yet. Try a test account first, or use Download .fit.</p>
          </>)}
          <div className="row"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn accent" onClick={go} disabled={busy || !canSend}>{busy ? "Sending…" : method === "download" ? "Download" : "Send"}</button></div>
        </>)}
      </motion.div>
    </motion.div>
  );
}
