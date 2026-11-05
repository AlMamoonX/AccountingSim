import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ExerciseSpecSchema, type ExerciseSpec } from "@/lib/spec/schema";
import { buildView, defaultParams, grade, paramsForSeed, type StudentAnswers } from "@/lib/spec/engine";
import { isUuid } from "@/lib/data";

export type RowStatus = "not_started" | "in_progress" | "handed_in" | "missed";

export const STATUS_LABEL: Record<RowStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  handed_in: "Handed in",
  missed: "Missed deadline",
};

export async function loadGradebook(assignmentId: string) {
  if (!isUuid(assignmentId)) return null;
  const db = await getDb();
  const [head] = await db
    .select({ a: schema.assignments, ex: schema.exercises, cls: schema.classes })
    .from(schema.assignments)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.assignments.exerciseId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
    .where(eq(schema.assignments.id, assignmentId));
  if (!head) return null;
  const spec = ExerciseSpecSchema.parse(head.ex.spec) as ExerciseSpec;
  const people = await db
    .select({ student: schema.users, sub: schema.submissions })
    .from(schema.enrollments)
    .innerJoin(schema.users, eq(schema.users.id, schema.enrollments.studentId))
    .leftJoin(schema.submissions, and(eq(schema.submissions.studentId, schema.users.id), eq(schema.submissions.assignmentId, assignmentId)))
    .where(eq(schema.enrollments.classId, head.a.classId))
    .orderBy(schema.users.email);
  const closed = new Date() > head.a.deadline;
  const rows = people.map(({ student, sub }) => {
    let status: RowStatus;
    if (sub?.status === "submitted") status = "handed_in";
    else if (closed) status = "missed";
    else status = sub ? "in_progress" : "not_started";
    return {
      studentId: student.id,
      email: student.email,
      status,
      progress: sub?.progress ?? 0,
      score: sub?.status === "submitted" ? (sub.score ?? 0) : null,
      max: sub?.maxScore ?? null,
      submittedAt: sub?.submittedAt ?? null,
      partScores: (sub?.partScores as { partId: string; title: string; score: number; max: number }[] | null) ?? null,
      sub,
    };
  });
  return { ...head, spec, rows, closed };
}

/** Per-part averages and the items most students got wrong (only handed-in work). */
export function classStats(spec: ExerciseSpec, rows: NonNullable<Awaited<ReturnType<typeof loadGradebook>>>["rows"]) {
  const done = rows.filter((r) => r.status === "handed_in" && r.sub);
  const view = buildView(spec, defaultParams(spec));
  const parts = spec.parts.map((p) => {
    const ps = done.map((r) => r.partScores?.find((x) => x.partId === p.id)).filter(Boolean) as { score: number; max: number }[];
    const avg = ps.length ? ps.reduce((s, x) => s + (x.max ? x.score / x.max : 0), 0) / ps.length : null;
    return { partId: p.id, title: p.title, avg };
  });

  const misses = new Map<string, { label: string; wrong: number; total: number }>();
  const bump = (key: string, label: string, wrong: boolean) => {
    const m = misses.get(key) ?? { label, wrong: 0, total: 0 };
    m.total++;
    if (wrong) m.wrong++;
    misses.set(key, m);
  };
  for (const r of done) {
    const g = grade(spec, paramsForSeed(spec, r.sub!.seed), r.sub!.answers as StudentAnswers);
    for (const p of spec.parts) {
      const res = g.parts.find((x) => x.partId === p.id)!;
      const pv = view.parts.find((x) => x.id === p.id)!;
      if (p.type === "grid" && pv.type === "grid") {
        for (const row of p.rows) {
          if (row.kind === "heading") continue;
          const keys = Object.keys(res.expected).filter((k) => k.startsWith(`${row.id}.`));
          if (!keys.some((k) => Math.abs(res.expected[k]) > 0.01)) {
            bump(`${p.id}.${row.id}`, `${p.title}: ${pv.rows.find((x) => x.id === row.id)?.label ?? row.label}`, keys.some((k) => res.marks[k] === "wrong"));
            continue;
          }
          const wrong = keys.some((k) => (Math.abs(res.expected[k]) > 0.01 ? res.marks[k] !== "right" : res.marks[k] === "wrong"));
          bump(`${p.id}.${row.id}`, `${p.title}: ${pv.rows.find((x) => x.id === row.id)?.label ?? row.label}`, wrong);
        }
        if (p.totals) {
          const wrong = p.columns.some((c) => res.marks[`total.${c.id}`] !== "right");
          bump(`${p.id}.totals`, `${p.title}: ${p.totalsLabel ?? "Totals"}`, wrong);
        }
      } else if (p.type === "journal" && pv.type === "journal") {
        for (const e of pv.entries) bump(`${p.id}.${e.id}`, `${p.title}: entry ${e.label}`, res.marks[e.id] !== "right");
      } else if (p.type === "numeric" && pv.type === "numeric") {
        for (const q of pv.questions) bump(`${p.id}.${q.id}`, `${p.title}: ${q.prompt}`, res.marks[q.id] !== "right");
      }
    }
  }
  const mostMissed = [...misses.values()]
    .filter((m) => m.wrong > 0)
    .map((m) => ({ ...m, rate: m.wrong / m.total }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 6);
  return { parts, mostMissed, handedIn: done.length };
}
