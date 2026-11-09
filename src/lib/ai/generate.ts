import { z } from "zod";
import { ExerciseSpecSchema, type ExerciseSpec } from "@/lib/spec/schema";
import { analyze } from "@/lib/spec/engine";
import { explainUnknownNames } from "@/lib/spec/nameHints";
import { hiddenInputs } from "@/lib/spec/visibility";
import { libraryIndex, searchLibrary, type LibraryHit } from "@/lib/library";
import { env } from "@/lib/env";
import { chatJSON, type ChatMessage } from "./client";
import { SYSTEM_PROMPT, fixPrompt } from "./prompt";

export interface GenerateRequest {
  prompt: string;
  business?: string;
  topic?: string;
  difficulty?: "easy" | "medium" | "hard";
  transactions?: number;
  mustInclude?: string[];
  parts?: string[];
  currency?: string;
  period?: string;
  useLibrary: boolean;
  sample?: { name: string; text?: string; imageDataUrl?: string };
}

export interface GenerateResult {
  spec: ExerciseSpec;
  warnings: string[];
  sources: { title: string; lecture: string | null; pageNo: number }[];
}

const MAX_REPAIRS = 2;

function describe(req: GenerateRequest): string {
  const lines = [`The doctor's request:\n"""${req.prompt.trim() || "(no free text: use the options below)"}"""`];
  const opt: string[] = [];
  if (req.business) opt.push(`Business idea: ${req.business}`);
  else opt.push("Business idea: invent a realistic small business in Oman.");
  if (req.topic) opt.push(`Topic: ${req.topic}`);
  if (req.difficulty) opt.push(`Difficulty: ${req.difficulty}`);
  if (req.transactions) opt.push(`Number of transactions: ${req.transactions}`);
  if (req.mustInclude?.length) opt.push(`Must include: ${req.mustInclude.join("; ")}`);
  if (req.parts?.length && !req.parts.includes("auto")) opt.push(`Parts wanted (in this order): ${req.parts.join(", ")}`);
  else opt.push("Parts: choose what fits the request best (one to three parts).");
  opt.push(`Currency: ${req.currency || "OMR"}`);
  if (req.period) opt.push(`Period: ${req.period}`);
  lines.push(opt.join("\n"));
  return lines.join("\n\n");
}

async function courseContext(req: GenerateRequest): Promise<{ text: string; hits: LibraryHit[] }> {
  const q = [req.prompt, req.topic, ...(req.mustInclude ?? []), ...(req.parts ?? [])].filter(Boolean).join(" ");
  return courseContextFor(q, req.useLibrary);
}

/** Lecture pages that match a request, formatted for the AI. */
export async function courseContextFor(q: string, useLibrary: boolean): Promise<{ text: string; hits: LibraryHit[] }> {
  if (!useLibrary) return { text: "", hits: [] };
  const [hits, index] = await Promise.all([searchLibrary(q, 8), libraryIndex()]);
  if (!index) return { text: "COURSE EXCERPTS: none uploaded yet. Use standard accounting and list what you used in outOfCourse.", hits: [] };
  const parts = [`COURSE LECTURES AVAILABLE:\n${index}`];
  if (hits.length) {
    parts.push(
      "COURSE EXCERPTS (most relevant pages; follow their terms and layouts):\n" +
        hits.map((h) => `--- ${h.lecture ? `${h.lecture} · ` : ""}${h.title}, page ${h.pageNo} ---\n${h.text.slice(0, 1800)}`).join("\n\n"),
    );
  } else parts.push("No excerpt matched this request: it is probably outside the slides. Use standard accounting and list it in outOfCourse.");
  return { text: parts.join("\n\n"), hits };
}

export function userMessage(text: string, imageDataUrl?: string): ChatMessage {
  if (imageDataUrl && env.aiVision) {
    return {
      role: "user",
      content: [
        { type: "text", text },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    };
  }
  return { role: "user", content: text };
}

/** Ask the AI, then validate and recompute everything; send problems back for repair up to MAX_REPAIRS times. */
export async function runWithRepair<T>(
  messages: ChatMessage[],
  kind: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  check: (value: T) => string[],
  id?: string,
  what = "exercise",
): Promise<{ spec: T; problems: string[] }> {
  let lastSpec: T | null = null;
  let lastProblems: string[] = [];
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const raw = await chatJSON(messages, attempt ? `${kind}-repair` : kind, id);
    messages.push({ role: "assistant", content: raw });
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      lastProblems = ["The reply was not valid JSON."];
      messages.push({ role: "user", content: fixPrompt(lastProblems) });
      continue;
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      lastProblems = zodProblems(parsed.error);
      messages.push({ role: "user", content: fixPrompt(lastProblems) });
      continue;
    }
    lastSpec = parsed.data;
    lastProblems = check(parsed.data);
    if (!lastProblems.length) break;
    if (attempt < MAX_REPAIRS) messages.push({ role: "user", content: fixPrompt(lastProblems) });
  }
  if (!lastSpec) throw new Error(`The AI didn't produce a usable ${what}. Problems: ${lastProblems.slice(0, 5).join("; ")}`);
  return { spec: lastSpec, problems: lastProblems };
}

function exerciseProblems(spec: ExerciseSpec): string[] {
  const a = analyze(spec);
  const problems = [...a.errors, ...a.checks.filter((c) => !c.ok).map((c) => `Check failed (${c.where}): ${c.label}${c.error ? ` – ${c.error}` : ""}`)];
  return [...explainUnknownNames(problems, { known: spec.params.map((p) => p.name), parts: spec.parts }), ...hiddenInputs(spec)];
}

export function zodProblems(err: z.ZodError): string[] {
  return err.issues.slice(0, 30).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

export function warningsFor(spec: ExerciseSpec, problems: string[]): string[] {
  return [...problems, ...spec.outOfCourse.map((o) => `Not from the course slides: ${o}`)];
}

export async function generateSpec(req: GenerateRequest): Promise<GenerateResult> {
  const ctx = await courseContext(req);
  let text = describe(req);
  if (ctx.text) text += `\n\n${ctx.text}`;
  if (req.sample?.text) text += `\n\nSAMPLE EXERCISE the doctor uploaded ("make one like this", new business and numbers):\n${req.sample.text.slice(0, 8000)}`;
  else if (req.sample?.imageDataUrl && env.aiVision) text += "\n\nThe attached image is a SAMPLE EXERCISE: make one like it, with a new business and numbers.";
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, userMessage(text, req.sample?.imageDataUrl)];
  const { spec, problems } = await runWithRepair(messages, "generate", ExerciseSpecSchema, exerciseProblems);
  return {
    spec,
    warnings: warningsFor(spec, problems),
    sources: ctx.hits.map((h) => ({ title: h.title, lecture: h.lecture, pageNo: h.pageNo })),
  };
}

export async function reviseSpec(spec: ExerciseSpec, instruction: string, exerciseId: string): Promise<{ spec: ExerciseSpec; warnings: string[] }> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Here is the current exercise:\n${JSON.stringify(spec)}\n\nThe doctor wants this change:\n"""${instruction}"""\n\nReturn the WHOLE updated exercise as JSON. Keep everything she didn't ask to change.`,
    },
  ];
  const r = await runWithRepair(messages, "revise", ExerciseSpecSchema, exerciseProblems, exerciseId);
  return { spec: r.spec, warnings: warningsFor(r.spec, r.problems) };
}
