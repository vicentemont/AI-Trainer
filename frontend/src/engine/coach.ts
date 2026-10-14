import type { ChatMessage, Plan } from "../types";
import { askJson, type Complete } from "./llm";
import { planDigest } from "./planner";
import { COACH_PROMPT } from "./prompts";
import { TurnSchema } from "./schemas";

export const transcript = (messages: ChatMessage[]) =>
  messages.map((m) => `${m.role === "user" ? "Athlete" : "Coach"}: ${m.content}`).join("\n");

export function coachTurn(complete: Complete, messages: ChatMessage[], context: string, plan: Plan | null) {
  const parts = [`Athlete data:\n${context}`];
  if (plan) parts.push(`Current plan digest:\n${planDigest(plan)}`);
  parts.push(`Conversation so far:\n${transcript(messages)}`, "Write the Coach's next turn as the JSON object.");
  return askJson(complete, COACH_PROMPT, parts.join("\n\n"), TurnSchema);
}
