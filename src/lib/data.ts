import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ExerciseSpecSchema, type ExerciseSpec } from "@/lib/spec/schema";
import type { AssignmentRow, SubmissionRow } from "@/db/schema";

/** All doctor accounts share the same classes, lectures and exercises (one course). */

export async function loadExercise(id: string) {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.exercises).where(eq(schema.exercises.id, id));
  if (!row) return null;
  return { row, spec: ExerciseSpecSchema.parse(row.spec) as ExerciseSpec };
}

export function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newJoinCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
}

/** Same numbers for everyone → seed 0. Different numbers → a stable seed per (assignment, student). */
export function seedFor(a: Pick<AssignmentRow, "id" | "variantMode">, studentId: string) {
  if (a.variantMode === "same") return 0;
  const h = crypto.createHash("sha256").update(`${a.id}:${studentId}`).digest();
  return (h.readUInt32BE(0) % 2_000_000_000) + 1;
}

export function assignmentState(a: AssignmentRow, sub?: Pick<SubmissionRow, "status"> | null, now = new Date()) {
  const opened = now >= a.opensAt;
  const closed = now > a.deadline;
  const submitted = sub?.status === "submitted";
  // Practice: results right after hand-in. Graded: results only after the deadline.
  const resultsVisible = closed || (a.mode === "practice" && submitted);
  return { opened, closed, submitted, resultsVisible, canWork: opened && !closed && !submitted };
}

export async function studentAssignment(assignmentId: string, studentId: string) {
  if (!isUuid(assignmentId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ a: schema.assignments, ex: schema.exercises, cls: schema.classes })
    .from(schema.assignments)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.assignments.exerciseId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
    .innerJoin(
      schema.enrollments,
      and(eq(schema.enrollments.classId, schema.assignments.classId), eq(schema.enrollments.studentId, studentId)),
    )
    .where(eq(schema.assignments.id, assignmentId));
  if (!row) return null;
  const [sub] = await db
    .select()
    .from(schema.submissions)
    .where(and(eq(schema.submissions.assignmentId, assignmentId), eq(schema.submissions.studentId, studentId)));
  return { ...row, spec: ExerciseSpecSchema.parse(row.ex.spec) as ExerciseSpec, sub: sub ?? null };
}

export async function ensureSubmission(a: AssignmentRow, studentId: string) {
  const db = await getDb();
  await db
    .insert(schema.submissions)
    .values({ assignmentId: a.id, studentId, seed: seedFor(a, studentId) })
    .onConflictDoNothing();
  const [sub] = await db
    .select()
    .from(schema.submissions)
    .where(and(eq(schema.submissions.assignmentId, a.id), eq(schema.submissions.studentId, studentId)));
  return sub;
}
