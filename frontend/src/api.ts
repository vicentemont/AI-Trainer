import type { AppState } from "./types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  state: () => call<AppState>("/api/state"),
  chat: (message: string) => call<AppState>("/api/chat", json({ message })),
  retry: (weeks: number[]) => call<AppState>("/api/retry", json({ weeks })),
  reset: () => call<AppState>("/api/reset", { method: "POST" }),
  upload: (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return call<AppState>("/api/upload", { method: "POST", body: fd });
  },
  saveSettings: (provider: string, api_key: string, model: string) =>
    call<AppState>("/api/settings", json({ provider, api_key, model })),
  deliver: (b: { selected: number[]; method: string; folder?: string; email?: string; password?: string; push_days?: number }) =>
    call<{ results: string[] }>("/api/deliver", json(b)),
};
