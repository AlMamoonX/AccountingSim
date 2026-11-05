import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadSim } from "@/lib/sim/data";
import { PageTitle } from "@/components/ui/bits";
import { SimAssignForm } from "./SimAssignForm";

export default async function SimAssignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sim = await loadSim(id);
  if (!sim) notFound();
  const db = await getDb();
  const classes = await db
    .select({ id: schema.classes.id, name: schema.classes.name, students: sql<number>`(select count(*)::int from enrollments e where e.class_id = ${schema.classes.id})` })
    .from(schema.classes)
    .where(eq(schema.classes.archived, false))
    .orderBy(desc(schema.classes.createdAt));
  return (
    <div className="stack">
      <PageTitle title="Give to a class" sub={`${sim.spec.title} · ${sim.spec.months} months`} />
      <SimAssignForm simId={id} classes={classes} months={sim.spec.months} />
    </div>
  );
}
