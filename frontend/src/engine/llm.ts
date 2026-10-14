import type { z } from "zod";

export type Provider = "openai" | "anthropic" | "gemini";
export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-4.1",
  anthropic: "claude-sonnet-5-5",
  gemini: "gemini-2.5-pro",
};

export interface LlmConfig { provider: Provider; apiKey: string; model?: string }
export type Complete = (system: string, user: string) => Promise<string>;

async function post(url: string, init: RequestInit, timeoutMs = 180_000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as any)?.error?.message ?? (data as any)?.message ?? `HTTP ${res.status}`;
      throw new Error(`${res.status === 401 || res.status === 403 ? "The AI provider rejected your API key. " : ""}${msg}`);
    }
    return data;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("The AI took too long to answer. Try again.");
    if (e instanceof TypeError) throw new Error("Couldn't reach the AI provider. Check your connection.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Calls the provider straight from the browser with the user's own key. */
export function makeComplete(cfg: LlmConfig): Complete {
  const model = cfg.model?.trim() || DEFAULT_MODELS[cfg.provider];
  if (cfg.provider === "openai") {
    return async (system, user) => {
      const d: any = await post("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      return d.choices?.[0]?.message?.content ?? "";
    };
  }
  if (cfg.provider === "anthropic") {
    return async (system, user) => {
      const d: any = await post("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model, max_tokens: 16000, system, messages: [{ role: "user", content: user }] }),
      });
      return d.content?.map((c: any) => c.text ?? "").join("") ?? "";
    };
  }
  return async (system, user) => {
    const d: any = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    return d.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  };
}

export function extractJson(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) t = t.slice(t.indexOf("\n") + 1, t.lastIndexOf("```"));
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  return a === -1 ? t : t.slice(a, b + 1);
}

/** Ask for JSON, validate it, and feed validation errors back to the model on retry. */
export async function askJson<S extends z.ZodTypeAny>(complete: Complete, system: string, user: string, schema: S, retries = 2): Promise<z.infer<S>> {
  let lastErr = "";
  for (let i = 0; i <= retries; i++) {
    const prompt = lastErr ? `${user}\n\nYour previous answer was invalid: ${lastErr}\nFix it.` : user;
    const raw = await complete(system, prompt);
    try {
      const parsed = schema.safeParse(JSON.parse(extractJson(raw)));
      if (parsed.success) return parsed.data;
      lastErr = parsed.error.issues.slice(0, 6).map((x) => `${x.path.join(".")}: ${x.message}`).join("; ");
    } catch (e) {
      lastErr = `not valid JSON (${(e as Error).message})`;
    }
  }
  throw new Error(`The AI returned an invalid response: ${lastErr}`);
}
