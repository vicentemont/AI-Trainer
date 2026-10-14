import FitParser from "fit-file-parser";
import type { Activity } from "../types";

/** Reads an activity .fit file in the browser; the file never leaves the device. */
export async function readActivity(file: File): Promise<Activity | null> {
  const parser = new FitParser({ mode: "list", lengthUnit: "m", speedUnit: "m/s" } as any);
  const data: any = await parser.parseAsync(await file.arrayBuffer());
  const s = data.sessions?.[0];
  if (!s) return null;
  const start = s.start_time ? new Date(s.start_time).toISOString() : null;
  return {
    sport: String(s.sport ?? "unknown"),
    start_time: start,
    duration_s: Number(s.total_timer_time ?? 0),
    distance_m: Number(s.total_distance ?? 0),
    avg_hr: s.avg_heart_rate ?? null,
    max_hr: s.max_heart_rate ?? null,
    source_file: file.name,
  };
}
