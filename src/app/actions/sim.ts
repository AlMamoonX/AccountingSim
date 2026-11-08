"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent, requireTeacher } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { SimMonthWorkSchema, SimSpecSchema, type SimMonthWork } from "@/lib/sim/schema";
import { monthWorkIssue, withMonthWork } from "@/lib/sim/work";
import { analyzeSim, runCompany, monthExercise, validateDecisions } from "@/lib/sim/engine";
import { autoFill, companyResults, loadRun, loadSim, monthRows, runState } from "@/lib/sim/data";
import { generateMonthWork, generateSim, reviseSim, simWarnings, type SimRequest } from "@/lib/ai/simGenerate";
import { grade, type StudentAnswers } from "@/lib/spec/engine";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const clean = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);

/* ---------------- doctor: sims ---------------- */

export async function generateSimAction(fd: FormData): Promise<Result<{ id: string }>> {
  const me = await requireTeacher();
  const duration = SimSpecSchema.shape.months.safeParse(Number(fd.get("months") || 4));
  if (!duration.success) return { ok: false, error: "Choose a whole number of months, at least 2." };
  const req: SimRequest = {
    prompt: clean(fd.get("prompt"), 4000),
    business: clean(fd.get("business")) || undefined,
    topics: clean(fd.get("topics"), 600).split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
    months: duration.data,
    difficulty: (["easy", "medium", "hard"].includes(clean(fd.get("difficulty"))) ? clean(fd.get("difficulty")) : undefined) as SimRequest["difficulty"],
    decisionIdeas: clean(fd.get("decisionIdeas"), 600) || undefined,
    eventIdeas: clean(fd.get("eventIdeas"), 600) || undefined,
    useLibrary: fd.get("useLibrary") === "on",
  };
  if (!req.prompt && !req.business && !req.topics?.length) return { ok: false, error: "Describe the simulation, or fill in a business or topics." };
  try {
    const out = await generateSim(req);
    const db = await getDb();
    const [row] = await db
      .insert(schema.sims)
      .values({ ownerId: me.id, title: out.spec.title, businessName: out.spec.business.name, spec: out.spec, warnings: out.warnings, request: req, sources: out.sources })
      .returning();
    await db.insert(schema.simVersions).values({ simId: row.id, spec: out.spec, note: "Made by AI" });
    revalidatePath("/t/sims");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function addSampleSim() {
  const me = await requireTeacher();
  const { karakSim } = await import("@/lib/sim/fixtures/karakSim");
  const spec = SimSpecSchema.parse(karakSim);
  const db = await getDb();
  const [row] = await db.insert(schema.sims).values({ ownerId: me.id, title: spec.title, businessName: spec.business.name, spec, warnings: [] }).returning();
  await db.insert(schema.simVersions).values({ simId: row.id, spec, note: "Sample" });
  redirect(`/t/sims/${row.id}`);
}

export async function saveSim(id: string, json: string, note = "Edited"): Promise<Result<{ warnings: string[] }>> {
  await requireTeacher();
  const sim = await loadSim(id);
  if (!sim) return { ok: false, error: "Simulation not found." };
  if (sim.row.status === "published") return { ok: false, error: "Published simulations are locked. Make a copy to change it." };
  let parsed;
  try {
    parsed = SimSpecSchema.safeParse(JSON.parse(json));
  } catch {
    return { ok: false, error: "That isn't valid JSON." };
  }
  if (!parsed.success) return { ok: false, error: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const a = analyzeSim(parsed.data);
  const warnings = simWarnings(parsed.data, [...a.errors, ...a.failed.map((f) => `Check failed: ${f}`)]);
  const db = await getDb();
  await db.update(schema.sims).set({ spec: parsed.data, title: parsed.data.title, businessName: parsed.data.business.name, warnings, updatedAt: new Date() }).where(eq(schema.sims.id, id));
  await db.insert(schema.simVersions).values({ simId: id, spec: parsed.data, note: note.slice(0, 200) });
  revalidatePath(`/t/sims/${id}`);
  return { ok: true, warnings };
}

export async function reviseSimAction(id: string, instruction: string): Promise<Result> {
  await requireTeacher();
  const sim = await loadSim(id);
  if (!sim) return { ok: false, error: "Simulation not found." };
  if (sim.row.status === "published") return { ok: false, error: "Published simulations are locked. Make a copy to change it." };
  if (!instruction.trim()) return { ok: false, error: "Say what to change." };
  try {
    const out = await reviseSim(sim.spec, instruction.trim().slice(0, 2000), id);
    const db = await getDb();
    await db.update(schema.sims).set({ spec: out.spec, title: out.spec.title, businessName: out.spec.business.name, warnings: out.warnings, updatedAt: new Date() }).where(eq(schema.sims.id, id));
    await db.insert(schema.simVersions).values({ simId: id, spec: out.spec, note: `AI: ${instruction.trim().slice(0, 180)}` });
    revalidatePath(`/t/sims/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function restoreSimVersion(id: string, versionId: number) {
  await requireTeacher();
  const db = await getDb();
  const [v] = await db.select().from(schema.simVersions).where(and(eq(schema.simVersions.id, versionId), eq(schema.simVersions.simId, id)));
  if (v) await saveSim(id, JSON.stringify(v.spec), "Brought back an older version");
}

export async function publishSim(id: string): Promise<Result> {
  await requireTeacher();
  const sim = await loadSim(id);
  if (!sim) return { ok: false, error: "Simulation not found." };
  const a = analyzeSim(sim.spec);
  if (a.errors.length) return { ok: false, error: `Fix these first: ${a.errors.slice(0, 3).join("; ")}` };
  const db = await getDb();
  await db.update(schema.sims).set({ status: "published", updatedAt: new Date() }).where(eq(schema.sims.id, id));
  revalidatePath(`/t/sims/${id}`);
  return { ok: true };
}

export async function copySim(id: string) {
  const me = await requireTeacher();
  const sim = await loadSim(id);
  if (!sim) return;
  const db = await getDb();
  const spec = { ...sim.spec, title: `${sim.spec.title} (copy)` };
  const [row] = await db.insert(schema.sims).values({ ownerId: me.id, title: spec.title, businessName: sim.row.businessName, spec, warnings: sim.row.warnings }).returning();
  await db.insert(schema.simVersions).values({ simId: row.id, spec, note: "Copied" });
  redirect(`/t/sims/${row.id}`);
}

export async function deleteSim(id: string) {
  await requireTeacher();
  const sim = await loadSim(id);
  if (!sim || sim.row.status !== "draft") return;
  const db = await getDb();
  const used = await db.select({ id: schema.simRuns.id }).from(schema.simRuns).where(eq(schema.simRuns.simId, id)).limit(1);
  if (used.length) return;
  await db.delete(schema.sims).where(eq(schema.sims.id, id));
  revalidatePath("/t/sims");
}

/* ---------------- doctor: runs ---------------- */

export async function createSimRun(fd: FormData): Promise<Result> {
  await requireTeacher();
  const simId = clean(fd.get("simId"));
  const classId = clean(fd.get("classId"));
  const weight = Math.round(Number(fd.get("accountingWeight")));
  const deadlineRaw = clean(fd.get("deadline"));
  const deadline = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadlineRaw) ? new Date(`${deadlineRaw}:00+04:00`) : null;
  if (!isUuid(classId)) return { ok: false, error: "Choose a class." };
  if (!deadline || deadline <= new Date()) return { ok: false, error: "Set a final deadline in the future." };
  if (!(weight >= 0 && weight <= 100)) return { ok: false, error: "Accounting weight must be 0–100." };
  const pub = await publishSim(simId);
  if (!pub.ok) return pub;
  const db = await getDb();
  const [run] = await db.insert(schema.simRuns).values({ simId, classId, deadline, accountingWeight: weight }).returning();
  redirect(`/t/sim-runs/${run.id}`);
}

export async function openNextMonth(runId: string): Promise<Result<{ autoPlayed: number }>> {
  await requireTeacher();
  const data = await loadRun(runId);
  if (!data) return { ok: false, error: "Not found." };
  const { run, spec } = data;
  const st = runState(run, spec);
  if (st.ended) return { ok: false, error: "This simulation has ended." };
  if (run.openedMonth >= spec.months) return { ok: false, error: "All months are already open." };
  const autoPlayed = await autoFill(run, spec, run.openedMonth);
  const db = await getDb();
  await db.update(schema.simRuns).set({ openedMonth: run.openedMonth + 1 }).where(eq(schema.simRuns.id, runId));
  revalidatePath(`/t/sim-runs/${runId}`);
  return { ok: true, autoPlayed };
}

export async function endRun(runId: string) {
  await requireTeacher();
  const data = await loadRun(runId);
  if (!data) return;
  await autoFill(data.run, data.spec, Math.min(data.run.openedMonth, data.spec.months));
  const db = await getDb();
  await db.update(schema.simRuns).set({ endedAt: new Date() }).where(eq(schema.simRuns.id, runId));
  revalidatePath(`/t/sim-runs/${runId}`);
}

export async function draftMonthWork(runId: string, month: number, instruction: string): Promise<Result<{ work: SimMonthWork }>> {
  await requireTeacher();
  const data = await loadRun(runId);
  if (!data) return { ok: false, error: "Simulation not found." };
  const issue = monthWorkIssue(data.run, data.spec.months, month);
  if (issue) return { ok: false, error: issue };
  if (!instruction.trim()) return { ok: false, error: "Describe what students should do that month." };
  try {
    const work = await generateMonthWork(data.spec, month, instruction.trim().slice(0, 4000), runId);
    return { ok: true, work };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function applyMonthWork(runId: string, raw: unknown): Promise<Result> {
  await requireTeacher();
  const parsed = SimMonthWorkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "The month plan is invalid. Generate a new draft." };
  const data = await loadRun(runId);
  if (!data) return { ok: false, error: "Simulation not found." };
  const db = await getDb();
  // Serialize against opening the month and other teachers saving plans.
  const result = await db.transaction(async (tx): Promise<Result> => {
    const [current] = await tx.select().from(schema.simRuns).where(eq(schema.simRuns.id, runId)).for("update");
    if (!current) return { ok: false, error: "Simulation not found." };
    const issue = monthWorkIssue(current, data.spec.months, parsed.data.month);
    if (issue) return { ok: false, error: issue };
    const plans = SimMonthWorkSchema.array().parse(current.monthWork);
    const base = withMonthWork(data.spec, plans);
    const candidate = withMonthWork(base, [parsed.data]);
    const analysis = analyzeSim(candidate);
    if (!analysis.ok) return { ok: false, error: `This plan cannot be applied: ${[...analysis.errors, ...analysis.failed].slice(0, 3).join("; ")}` };
    const next = [...plans.filter((w) => w.month !== parsed.data.month), parsed.data].sort((a, b) => a.month - b.month);
    await tx.update(schema.simRuns).set({ monthWork: next }).where(eq(schema.simRuns.id, runId));
    return { ok: true };
  });
  if (result.ok) {
    revalidatePath(`/t/sim-runs/${runId}`);
    revalidatePath(`/s/sims/${runId}`);
  }
  return result;
}

/* ---------------- student ---------------- */

async function studentRun(runId: string) {
  const me = await requireStudent();
  const data = await loadRun(runId);
  if (!data) throw new Error("Simulation not found.");
  const db = await getDb();
  const [enrolled] = await db
    .select()
    .from(schema.enrollments)
    .where(and(eq(schema.enrollments.classId, data.run.classId), eq(schema.enrollments.studentId, me.id)));
  if (!enrolled) throw new Error("You're not in this class.");
  const [player] = await db.select().from(schema.simPlayers).where(and(eq(schema.simPlayers.runId, runId), eq(schema.simPlayers.studentId, me.id)));
  return { me, ...data, player: player ?? null };
}

export async function startCompany(runId: string, fd: FormData): Promise<void> {
  const { me, run, spec } = await studentRun(runId);
  if (runState(run, spec).ended) return;
  const name = clean(fd.get("companyName"), 40) || "My company";
  const db = await getDb();
  await db.insert(schema.simPlayers).values({ runId: run.id, studentId: me.id, companyName: name }).onConflictDoNothing();
  // Late joiners start in the currently open month, with earlier months settled.
  if (run.openedMonth > 1) await autoFill(run, spec, run.openedMonth - 1);
  revalidatePath(`/s/sims/${runId}`);
}

export async function lockDecisions(runId: string, raw: Record<string, unknown>): Promise<Result> {
  try {
    const { run, spec, player } = await studentRun(runId);
    if (!player) return { ok: false, error: "Name your company first." };
    if (runState(run, spec).ended) return { ok: false, error: "This simulation has ended." };
    const v = validateDecisions(spec, raw);
    if (!v.ok) return v;
    const rows = await monthRows(player.id);
    const month = run.openedMonth;
    if (rows.some((r) => r.month === month)) return { ok: false, error: "You've already decided this month." };
    for (let m = 1; m < month; m++) if (!rows.some((r) => r.month === m && r.step === "done")) return { ok: false, error: "Finish the earlier months first." };
    const db = await getDb();
    await db.insert(schema.simMonths).values({ playerId: player.id, month, decisions: v.values, step: "record" }).onConflictDoNothing();
    revalidatePath(`/s/sims/${runId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function submitMonthBooks(runId: string, answers: unknown): Promise<Result> {
  try {
    const { run, spec, player } = await studentRun(runId);
    if (!player) return { ok: false, error: "Name your company first." };
    if (runState(run, spec).ended) return { ok: false, error: "This simulation has ended." };
    const rows = await monthRows(player.id);
    const row = rows.find((r) => r.month === run.openedMonth);
    if (!row || row.step !== "record") return { ok: false, error: "Nothing to hand in right now." };
    const json = JSON.stringify(answers ?? {});
    if (json.length > 200_000) return { ok: false, error: "Answers are too large." };
    const results = companyResults(spec, rows);
    const ex = monthExercise(spec, results[row.month - 1]);
    const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
    const g = grade(ex, params, JSON.parse(json) as StudentAnswers);
    const db = await getDb();
    await db
      .update(schema.simMonths)
      .set({ answers: JSON.parse(json), step: "done", accScore: g.score, accMax: g.max, doneAt: new Date() })
      .where(and(eq(schema.simMonths.playerId, player.id), eq(schema.simMonths.month, row.month)));
    revalidatePath(`/s/sims/${runId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Used by the doctor's Test play tab: nothing secret, the doctor already has the spec. */
export async function testPlay(id: string, decisions: Record<string, number>[]) {
  await requireTeacher();
  const sim = await loadSim(id);
  if (!sim) return null;
  return runCompany(sim.spec, decisions);
}

/** Form-friendly wrappers (forms need actions that return nothing). */
export async function openNextMonthForm(runId: string) {
  await openNextMonth(runId);
}
export async function endRunForm(runId: string) {
  await endRun(runId);
}
