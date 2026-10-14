import { z } from "zod";

const nn = <T extends z.ZodTypeAny>(t: T) => t.nullish().transform((v) => v ?? null);
const num = z.coerce.number();

export const StepSchema = z.object({
  kind: z.enum(["warmup", "active", "recovery", "rest", "cooldown"]).default("active"),
  duration_type: z.enum(["time", "distance", "open"]).default("time"),
  duration_value: nn(num),
  target_type: z.enum(["none", "hr_zone", "hr_bpm", "pace", "power_w", "cadence"]).default("none"),
  target_low: nn(num),
  target_high: nn(num),
  repeat: z.coerce.number().int().min(1).default(1),
  notes: nn(z.string()),
  why: nn(z.string()),
});

export const BlockSchema = z.object({
  repeat: z.coerce.number().int().min(2),
  steps: z.array(StepSchema).min(1),
});

export const WorkoutSchema = z.object({
  name: z.string().max(60),
  sport: z.enum(["running", "cycling", "swimming", "strength"]),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  week: nn(z.number()),
  description: nn(z.string()),
  why: nn(z.string()),
  // blocks first: a block has a `steps` array, a plain step does not
  steps: z.array(z.union([BlockSchema, StepSchema])).min(1),
});

export const WeekWorkoutsSchema = z.object({ workouts: z.array(WorkoutSchema) });

export const PhaseSchema = z.object({
  name: z.string(),
  start_week: z.coerce.number().int().min(1),
  end_week: z.coerce.number().int().min(1),
  focus: z.string(),
  why: z.string(),
});

export const WeekOutlineSchema = z.object({
  week: z.coerce.number().int().min(1),
  theme: z.string(),
  why: nn(z.string()),
  target_hours: num.min(0),
  load: z.enum(["recovery", "easy", "moderate", "hard", "peak"]).default("moderate"),
});

export const OutlineSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phases: z.array(PhaseSchema).min(1),
  weeks: z.array(WeekOutlineSchema).min(1).max(60),
});

export const TurnSchema = z.object({
  reply: z.string(),
  outline: nn(OutlineSchema),
  regenerate_weeks: nn(z.array(z.coerce.number().int())),
  regenerate_notes: nn(z.string()),
});
export type Turn = z.infer<typeof TurnSchema>;
