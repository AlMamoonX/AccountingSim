import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadExercise } from "@/lib/data";
import { ReviewClient } from "./ReviewClient";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ex = await loadExercise(id);
  if (!ex) notFound();
  const db = await getDb();
  const versions = await db
    .select({ id: schema.exerciseVersions.id, note: schema.exerciseVersions.note, createdAt: schema.exerciseVersions.createdAt })
    .from(schema.exerciseVersions)
    .where(eq(schema.exerciseVersions.exerciseId, id))
    .orderBy(desc(schema.exerciseVersions.createdAt))
    .limit(20);
  const [{ used }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(schema.assignments)
    .where(eq(schema.assignments.exerciseId, id));
  return (
    <ReviewClient
      id={id}
      status={ex.row.status}
      spec={ex.spec}
      savedWarnings={ex.row.warnings as string[]}
      sources={ex.row.sources as { title: string; lecture: string | null; pageNo: number }[]}
      versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
      used={used}
    />
  );
}
