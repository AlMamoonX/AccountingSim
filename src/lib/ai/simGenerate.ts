import { SimMonthWorkSchema, SimSpecSchema, type SimSpec } from "@/lib/sim/schema";
import { analyzeSim } from "@/lib/sim/engine";
import { withMonthWork } from "@/lib/sim/work";
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

/** Change coursework only for a future month of this class's running game. */
export async function generateMonthWork(spec: SimSpec, month: number, instruction: string, runId: string) {
  const ctx = await courseContextFor(instruction, true);
  const messages: ChatMessage[] = [
    { role: "system", content: SIM_PROMPT },
    { role: "user", content: `This simulation is already running:\n${JSON.stringify(spec)}\n\nThe teacher wants to change ONLY the student tasks for month ${month}:\n${instruction}\n\n${ctx.text}\n\nReturn ONE MONTH WORK PLAN, not a simulation: {"month": ${month}, "title": "...", "instructions": "...", "parts": [Part, ...], "transactions"?: [{"id":"...","text":"...","when"?:"formula"}]}. Use the same grid/journal/numeric part schemas as the example. Number questions must use ONLY names already available in the company's monthly formulas. Theory questions use answerKind:"text" with a literal expected term. Do not change the business model, decisions, state, events, scoring or other months. Parts replace this month's entire coursework; keep any existing tasks the teacher did not ask to remove. Write instructions for students without revealing answers. Omit transactions to retain the normal monthly transactions. Month must equal ${month}.` },
  ];
  const schema = SimMonthWorkSchema.refine((w) => w.month === month, `The plan must be for month ${month}`);
  const result = await runWithRepair(messages, "sim-month-work", schema, (work) => simProblems(withMonthWork(spec, [work])), runId, "month plan");
  if (result.problems.length) throw new Error(`The month plan did not pass validation: ${result.problems.slice(0, 3).join("; ")}. Try a simpler request.`);
  return result.spec;
}
