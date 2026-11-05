import { SimSpecSchema, type SimSpec } from "@/lib/sim/schema";
import { analyzeSim } from "@/lib/sim/engine";
import type { ChatMessage } from "./client";
import { courseContextFor, runWithRepair } from "./generate";
import { SIM_PROMPT } from "./simPrompt";

export interface SimRequest {
  prompt: string;
  business?: string;
  topics?: string[];
  months?: number;
  difficulty?: "easy" | "medium" | "hard";
  decisionIdeas?: string;
  eventIdeas?: string;
  useLibrary: boolean;
}

export function simProblems(spec: SimSpec): string[] {
  const a = analyzeSim(spec);
  return [...a.errors, ...a.failed.map((f) => `Check failed: ${f}`)];
}

export function simWarnings(spec: SimSpec, problems: string[]) {
  return [...problems, ...spec.outOfCourse.map((o) => `Not from the course slides: ${o}`)];
}

function describe(req: SimRequest) {
  const o: string[] = [`The doctor's request:\n"""${req.prompt.trim() || "(no free text: use the options below)"}"""`];
  o.push(req.business ? `Business idea: ${req.business}` : "Business idea: invent a realistic small business in Oman.");
  if (req.topics?.length) o.push(`Accounting topics to practise in the monthly books: ${req.topics.join(", ")}`);
  o.push(`Number of months: ${req.months ?? 4}`);
  if (req.difficulty) o.push(`Difficulty: ${req.difficulty}`);
  if (req.decisionIdeas) o.push(`Decisions the doctor would like: ${req.decisionIdeas}`);
  if (req.eventIdeas) o.push(`Event ideas: ${req.eventIdeas}`);
  return o.join("\n");
}

export async function generateSim(req: SimRequest) {
  const ctx = await courseContextFor([req.prompt, req.business, ...(req.topics ?? [])].filter(Boolean).join(" "), req.useLibrary);
  let text = describe(req);
  if (ctx.text) text += `\n\n${ctx.text}`;
  const messages: ChatMessage[] = [
    { role: "system", content: SIM_PROMPT },
    { role: "user", content: text },
  ];
  const { spec, problems } = await runWithRepair(messages, "sim-generate", SimSpecSchema, simProblems, undefined, "simulation");
  return { spec, warnings: simWarnings(spec, problems), sources: ctx.hits.map((h) => ({ title: h.title, lecture: h.lecture, pageNo: h.pageNo })) };
}

export async function reviseSim(spec: SimSpec, instruction: string, simId: string) {
  const messages: ChatMessage[] = [
    { role: "system", content: SIM_PROMPT },
    {
      role: "user",
      content: `Here is the current simulation:\n${JSON.stringify(spec)}\n\nThe doctor wants this change:\n"""${instruction}"""\n\nReturn the WHOLE updated simulation as JSON. Keep everything she didn't ask to change.`,
    },
  ];
  const r = await runWithRepair(messages, "sim-revise", SimSpecSchema, simProblems, simId, "simulation");
  return { spec: r.spec, warnings: simWarnings(r.spec, r.problems) };
}
