import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadExercise } from "@/lib/data";
import { PageTitle } from "@/components/ui/bits";
import { AssignForm } from "./AssignForm";

export default async function AssignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ex = await loadExercise(id);
  if (!ex) notFound();
  const db = await getDb();
  const classes = await db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      students: sql<number>`(select count(*)::int from enrollments e where e.class_id = ${schema.classes.id})`,
    })
    .from(schema.classes)
    .where(eq(schema.classes.archived, false))
    .orderBy(desc(schema.classes.createdAt));
  const ranged = ex.spec.params.some((p) => p.min !== undefined && p.max !== undefined);
  return (
    <div className="stack">
      <PageTitle title="Give to a class" sub={ex.spec.title} />
      <AssignForm exerciseId={id} classes={classes} canVary={ranged} published={ex.row.status === "published"} />
    </div>
  );
}
