"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { isUuid, loadExercise, newJoinCode } from "@/lib/data";
import { ExerciseSpecSchema } from "@/lib/spec/schema";
import { analyze } from "@/lib/spec/engine";
import { generateSpec, reviseSpec, warningsFor, type GenerateRequest } from "@/lib/ai/generate";
import { MAX_UPLOAD_BYTES, extractPages, kindOf, processDocument, saveUpload } from "@/lib/library";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const clean = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);

/* ---------------- classes ---------------- */

export async function createClass(fd: FormData) {
  const me = await requireTeacher();
  const name = clean(fd.get("name"), 120);
  if (!name) return;
  const db = await getDb();
  for (let i = 0; i < 5; i++) {
    const res = await db.insert(schema.classes).values({ name, teacherId: me.id, joinCode: newJoinCode() }).onConflictDoNothing().returning();
    if (res.length) break;
  }
  revalidatePath("/t/classes");
}

export async function renameClass(id: string, fd: FormData) {
  await requireTeacher();
  const name = clean(fd.get("name"), 120);
  if (!name || !isUuid(id)) return;
  const db = await getDb();
  await db.update(schema.classes).set({ name }).where(eq(schema.classes.id, id));
  revalidatePath("/t/classes");
  revalidatePath(`/t/classes/${id}`);
}

export async function newClassCode(id: string) {
  await requireTeacher();
  if (!isUuid(id)) return;
  const db = await getDb();
  for (let i = 0; i < 5; i++) {
    try {
      await db.update(schema.classes).set({ joinCode: newJoinCode() }).where(eq(schema.classes.id, id));
      break;
    } catch {
      /* code clash, try another */
    }
  }
  revalidatePath("/t/classes");
}

export async function setClassArchived(id: string, archived: boolean) {
  await requireTeacher();
  if (!isUuid(id)) return;
  const db = await getDb();
  await db.update(schema.classes).set({ archived }).where(eq(schema.classes.id, id));
  revalidatePath("/t/classes");
}

export async function removeStudent(classId: string, studentId: string) {
  await requireTeacher();
  if (!isUuid(classId) || !isUuid(studentId)) return;
  const db = await getDb();
  await db.delete(schema.enrollments).where(and(eq(schema.enrollments.classId, classId), eq(schema.enrollments.studentId, studentId)));
  revalidatePath(`/t/classes/${classId}`);
}

/* ---------------- lecture library ---------------- */

export async function uploadLectures(fd: FormData): Promise<Result<{ count: number }>> {
  const me = await requireTeacher();
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Choose at least one file." };
  const lecture = clean(fd.get("lecture"), 80) || null;
  const db = await getDb();
  const ids: string[] = [];
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${f.name} is bigger than 25 MB.` };
    if (!kindOf(f.name, f.type)) return { ok: false, error: `${f.name}: use PDF, PowerPoint (.pptx) or an image.` };
    const buf = Buffer.from(await f.arrayBuffer());
    const storedPath = await saveUpload(buf, f.name);
    const [doc] = await db
      .insert(schema.courseDocuments)
      .values({
        title: f.name.replace(/\.[^.]+$/, ""),
        lecture,
        fileName: f.name,
        mimeType: f.type || "application/octet-stream",
        storedPath,
        uploadedBy: me.id,
      })
      .returning();
    ids.push(doc.id);
  }
  for (const id of ids) await processDocument(id);
  revalidatePath("/t/lectures");
  return { ok: true, count: ids.length };
}

export async function retryLecture(id: string) {
  await requireTeacher();
  if (!isUuid(id)) return;
  const db = await getDb();
  await db.update(schema.courseDocuments).set({ status: "reading", error: null }).where(eq(schema.courseDocuments.id, id));
  await processDocument(id);
  revalidatePath("/t/lectures");
}

export async function deleteLecture(id: string) {
  await requireTeacher();
  if (!isUuid(id)) return;
  const db = await getDb();
  const [doc] = await db.delete(schema.courseDocuments).where(eq(schema.courseDocuments.id, id)).returning();
  if (doc) await import("node:fs/promises").then((fs) => fs.rm(doc.storedPath, { force: true }));
  revalidatePath("/t/lectures");
}

export async function updateLecture(id: string, fd: FormData) {
  await requireTeacher();
  if (!isUuid(id)) return;
  const db = await getDb();
  await db
    .update(schema.courseDocuments)
    .set({ title: clean(fd.get("title"), 160) || "Untitled", lecture: clean(fd.get("lecture"), 80) || null })
    .where(eq(schema.courseDocuments.id, id));
  revalidatePath("/t/lectures");
}

/* ---------------- exercises ---------------- */

export async function generateExercise(fd: FormData): Promise<Result<{ id: string }>> {
  const me = await requireTeacher();
  const list = (k: string) =>
    clean(fd.get(k), 1000)
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  const req: GenerateRequest = {
    prompt: clean(fd.get("prompt"), 4000),
    business: clean(fd.get("business")) || undefined,
    topic: clean(fd.get("topic")) || undefined,
    difficulty: (["easy", "medium", "hard"].includes(clean(fd.get("difficulty"))) ? clean(fd.get("difficulty")) : undefined) as GenerateRequest["difficulty"],
    transactions: Number(fd.get("transactions")) || undefined,
    mustInclude: list("mustInclude"),
    parts: fd.getAll("parts").map(String),
    currency: clean(fd.get("currency"), 10) || "OMR",
    period: clean(fd.get("period"), 60) || undefined,
    useLibrary: fd.get("useLibrary") === "on",
  };
  if (!req.prompt && !req.topic && !req.business) return { ok: false, error: "Describe the exercise, or fill in at least a topic or business." };
  const sample = fd.get("sample");
  if (sample instanceof File && sample.size > 0) {
    if (sample.size > MAX_UPLOAD_BYTES) return { ok: false, error: "The sample file is bigger than 25 MB." };
    const kind = kindOf(sample.name, sample.type);
    if (!kind) return { ok: false, error: "The sample must be a PDF, PowerPoint (.pptx) or image." };
    const buf = Buffer.from(await sample.arrayBuffer());
    if (kind === "image") req.sample = { name: sample.name, imageDataUrl: `data:${sample.type || "image/png"};base64,${buf.toString("base64")}` };
    else req.sample = { name: sample.name, text: (await extractPages(buf, sample.name, sample.type)).join("\n\n") };
  }
  try {
    const out = await generateSpec(req);
    const db = await getDb();
    const [row] = await db
      .insert(schema.exercises)
      .values({
        ownerId: me.id,
        title: out.spec.title,
        businessName: out.spec.business.name,
        spec: out.spec,
        warnings: out.warnings,
        request: { ...req, sample: req.sample ? { name: req.sample.name } : undefined },
        sources: out.sources,
      })
      .returning();
    await db.insert(schema.exerciseVersions).values({ exerciseId: row.id, spec: out.spec, note: "Made by AI" });
    revalidatePath("/t/exercises");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveExercise(id: string, specJson: string, note = "Edited"): Promise<Result<{ warnings: string[] }>> {
  await requireTeacher();
  const ex = await loadExercise(id);
  if (!ex) return { ok: false, error: "Exercise not found." };
  if (ex.row.status === "published") return { ok: false, error: "Published exercises are locked. Make a copy to change it." };
  let parsed;
  try {
    parsed = ExerciseSpecSchema.safeParse(JSON.parse(specJson));
  } catch {
    return { ok: false, error: "That isn't valid JSON." };
  }
  if (!parsed.success) return { ok: false, error: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const spec = parsed.data;
  const a = analyze(spec);
  const warnings = warningsFor(spec, [...a.errors, ...a.checks.filter((c) => !c.ok).map((c) => `Check failed (${c.where}): ${c.label}`)]);
  const db = await getDb();
  await db
    .update(schema.exercises)
    .set({ spec, title: spec.title, businessName: spec.business.name, warnings, updatedAt: new Date() })
    .where(eq(schema.exercises.id, id));
  await db.insert(schema.exerciseVersions).values({ exerciseId: id, spec, note: note.slice(0, 200) });
  revalidatePath(`/t/exercises/${id}`);
  return { ok: true, warnings };
}

export async function reviseExercise(id: string, instruction: string): Promise<Result> {
  await requireTeacher();
  const ex = await loadExercise(id);
  if (!ex) return { ok: false, error: "Exercise not found." };
  if (ex.row.status === "published") return { ok: false, error: "Published exercises are locked. Make a copy to change it." };
  if (!instruction.trim()) return { ok: false, error: "Say what to change." };
  try {
    const out = await reviseSpec(ex.spec, instruction.trim().slice(0, 2000), id);
    const db = await getDb();
    await db
      .update(schema.exercises)
      .set({ spec: out.spec, title: out.spec.title, businessName: out.spec.business.name, warnings: out.warnings, updatedAt: new Date() })
      .where(eq(schema.exercises.id, id));
    await db.insert(schema.exerciseVersions).values({ exerciseId: id, spec: out.spec, note: `AI: ${instruction.trim().slice(0, 180)}` });
    revalidatePath(`/t/exercises/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function restoreVersion(id: string, versionId: number) {
  await requireTeacher();
  const db = await getDb();
  const [v] = await db
    .select()
    .from(schema.exerciseVersions)
    .where(and(eq(schema.exerciseVersions.id, versionId), eq(schema.exerciseVersions.exerciseId, id)));
  if (!v) return;
  await saveExercise(id, JSON.stringify(v.spec), `Brought back version from ${v.createdAt.toISOString().slice(0, 16).replace("T", " ")}`);
}

export async function publishExercise(id: string): Promise<Result> {
  await requireTeacher();
  const ex = await loadExercise(id);
  if (!ex) return { ok: false, error: "Exercise not found." };
  const a = analyze(ex.spec);
  if (a.errors.length) return { ok: false, error: `Fix these first: ${a.errors.slice(0, 3).join("; ")}` };
  const db = await getDb();
  await db.update(schema.exercises).set({ status: "published", updatedAt: new Date() }).where(eq(schema.exercises.id, id));
  revalidatePath(`/t/exercises/${id}`);
  revalidatePath("/t/exercises");
  return { ok: true };
}

export async function copyExercise(id: string) {
  const me = await requireTeacher();
  const ex = await loadExercise(id);
  if (!ex) return;
  const db = await getDb();
  const [row] = await db
    .insert(schema.exercises)
    .values({
      ownerId: me.id,
      title: `${ex.row.title} (copy)`,
      businessName: ex.row.businessName,
      spec: { ...ex.spec, title: `${ex.spec.title} (copy)` },
      warnings: ex.row.warnings,
      request: ex.row.request,
      sources: ex.row.sources,
      parentId: id,
    })
    .returning();
  await db.insert(schema.exerciseVersions).values({ exerciseId: row.id, spec: row.spec, note: "Copied" });
  redirect(`/t/exercises/${row.id}`);
}

export async function deleteExercise(id: string) {
  await requireTeacher();
  const ex = await loadExercise(id);
  if (!ex || ex.row.status !== "draft") return;
  const db = await getDb();
  const used = await db.select({ id: schema.assignments.id }).from(schema.assignments).where(eq(schema.assignments.exerciseId, id)).limit(1);
  if (used.length) return;
  await db.delete(schema.exercises).where(eq(schema.exercises.id, id));
  revalidatePath("/t/exercises");
}

/* ---------------- assignments ---------------- */

/** datetime-local values are Muscat time (UTC+4, no daylight saving). */
function muscatToDate(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createAssignment(fd: FormData): Promise<Result> {
  await requireTeacher();
  const exerciseId = clean(fd.get("exerciseId"));
  const classId = clean(fd.get("classId"));
  const mode = clean(fd.get("mode"));
  const variantMode = clean(fd.get("variantMode"));
  const opensAt = muscatToDate(clean(fd.get("opensAt"))) ?? new Date();
  const deadline = muscatToDate(clean(fd.get("deadline")));
  if (!isUuid(classId)) return { ok: false, error: "Choose a class." };
  if (mode !== "practice" && mode !== "graded") return { ok: false, error: "Choose a mode." };
  if (variantMode !== "same" && variantMode !== "unique") return { ok: false, error: "Choose how numbers work." };
  if (!deadline) return { ok: false, error: "Set a deadline." };
  if (deadline <= opensAt) return { ok: false, error: "The deadline must be after the start." };
  const ex = await loadExercise(exerciseId);
  if (!ex) return { ok: false, error: "Exercise not found." };
  const db = await getDb();
  if (ex.row.status !== "published") {
    const pub = await publishExercise(exerciseId);
    if (!pub.ok) return pub;
  }
  const [a] = await db.insert(schema.assignments).values({ exerciseId, classId, mode, variantMode, opensAt, deadline }).returning();
  revalidatePath("/t");
  redirect(`/t/assignments/${a.id}`);
}

export async function changeDeadline(id: string, fd: FormData) {
  await requireTeacher();
  const deadline = muscatToDate(clean(fd.get("deadline")));
  if (!deadline || !isUuid(id)) return;
  const db = await getDb();
  await db.update(schema.assignments).set({ deadline }).where(eq(schema.assignments.id, id));
  revalidatePath(`/t/assignments/${id}`);
}

export async function closeAssignmentNow(id: string) {
  await requireTeacher();
  if (!isUuid(id)) return;
  const db = await getDb();
  await db.update(schema.assignments).set({ deadline: new Date() }).where(eq(schema.assignments.id, id));
  revalidatePath(`/t/assignments/${id}`);
}

export async function latestVersions(id: string) {
  await requireTeacher();
  const db = await getDb();
  return db
    .select({ id: schema.exerciseVersions.id, note: schema.exerciseVersions.note, createdAt: schema.exerciseVersions.createdAt })
    .from(schema.exerciseVersions)
    .where(eq(schema.exerciseVersions.exerciseId, id))
    .orderBy(desc(schema.exerciseVersions.createdAt))
    .limit(20);
}

/** Adds the Lecture 5 Karak exercise as a draft, so the app can be tried before the AI key is set up. */
export async function addSampleExercise() {
  const me = await requireTeacher();
  const { karakSpec } = await import("@/lib/spec/fixtures/karak");
  const spec = ExerciseSpecSchema.parse(karakSpec);
  const db = await getDb();
  const [row] = await db
    .insert(schema.exercises)
    .values({ ownerId: me.id, title: spec.title, businessName: spec.business.name, spec, warnings: [], sources: [] })
    .returning();
  await db.insert(schema.exerciseVersions).values({ exerciseId: row.id, spec, note: "Sample from Lecture 5" });
  redirect(`/t/exercises/${row.id}`);
}
