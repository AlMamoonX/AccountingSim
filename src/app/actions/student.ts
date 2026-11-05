"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { assignmentState, ensureSubmission, studentAssignment } from "@/lib/data";
import { grade, paramsForSeed, stripExpected, type Mark, type StudentAnswers } from "@/lib/spec/engine";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_ANSWER_BYTES = 200_000;

export async function joinClass(_: unknown, fd: FormData): Promise<{ message: string; ok: boolean }> {
  const me = await requireStudent();
  const code = String(fd.get("code") ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) return { ok: false, message: "Type the class code from your doctor." };
  const db = await getDb();
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.joinCode, code));
  if (!cls || cls.archived) return { ok: false, message: "No open class has that code. Check it with your doctor." };
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId: me.id }).onConflictDoNothing();
  revalidatePath("/s");
  return { ok: true, message: `You joined ${cls.name}.` };
}

function sanitize(answers: unknown): StudentAnswers {
  const json = JSON.stringify(answers ?? {});
  if (json.length > MAX_ANSWER_BYTES) throw new Error("Answers are too large.");
  return JSON.parse(json) as StudentAnswers;
}

async function load(assignmentId: string) {
  const me = await requireStudent();
  const data = await studentAssignment(assignmentId, me.id);
  if (!data) throw new Error("Assignment not found.");
  return { me, ...data };
}

export async function saveAnswers(assignmentId: string, answers: unknown): Promise<Result<{ savedAt: string }>> {
  try {
    const { me, a, spec, sub } = await load(assignmentId);
    const st = assignmentState(a, sub);
    if (st.closed) return { ok: false, error: "The deadline has passed." };
    if (st.submitted) return { ok: false, error: "Already handed in." };
    if (!st.opened) return { ok: false, error: "Not open yet." };
    const s = sub ?? (await ensureSubmission(a, me.id));
    const clean = sanitize(answers);
    const g = grade(spec, paramsForSeed(spec, s.seed), clean);
    const db = await getDb();
    const now = new Date();
    await db.update(schema.submissions).set({ answers: clean, progress: g.progress, updatedAt: now }).where(eq(schema.submissions.id, s.id));
    return { ok: true, savedAt: now.toISOString() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Practice mode only: right/wrong per filled box for one part. Never returns the correct values. */
export async function checkPart(
  assignmentId: string,
  partId: string,
  answers: unknown,
): Promise<Result<{ marks: Record<string, Mark>; score: number; max: number }>> {
  try {
    const { me, a, spec, sub } = await load(assignmentId);
    if (a.mode !== "practice") return { ok: false, error: "Checking is off for graded work." };
    const st = assignmentState(a, sub);
    if (!st.canWork) return { ok: false, error: st.closed ? "The deadline has passed." : "You can't check this now." };
    const s = sub ?? (await ensureSubmission(a, me.id));
    const g = stripExpected(grade(spec, paramsForSeed(spec, s.seed), sanitize(answers)));
    const part = g.parts.find((p) => p.partId === partId);
    if (!part) return { ok: false, error: "Part not found." };
    return { ok: true, marks: part.marks, score: part.score, max: part.max };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function handIn(assignmentId: string, answers: unknown): Promise<Result> {
  try {
    const { me, a, spec, sub } = await load(assignmentId);
    const st = assignmentState(a, sub);
    if (st.closed) return { ok: false, error: "The deadline has passed." };
    if (st.submitted) return { ok: false, error: "Already handed in." };
    if (!st.opened) return { ok: false, error: "Not open yet." };
    const s = sub ?? (await ensureSubmission(a, me.id));
    const clean = sanitize(answers);
    const g = grade(spec, paramsForSeed(spec, s.seed), clean);
    const db = await getDb();
    const now = new Date();
    await db
      .update(schema.submissions)
      .set({
        answers: clean,
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
        score: g.score,
        maxScore: g.max,
        progress: g.progress,
        partScores: g.parts.map((p) => ({ partId: p.partId, title: p.title, score: p.score, max: p.max })),
      })
      .where(eq(schema.submissions.id, s.id));
    revalidatePath("/s");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
