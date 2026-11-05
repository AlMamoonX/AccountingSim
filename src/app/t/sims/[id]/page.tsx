import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadSim } from "@/lib/sim/data";
import { SimReview } from "./SimReview";

export default async function SimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sim = await loadSim(id);
  if (!sim) notFound();
  const db = await getDb();
  const versions = await db
    .select({ id: schema.simVersions.id, note: schema.simVersions.note, createdAt: schema.simVersions.createdAt })
    .from(schema.simVersions)
    .where(eq(schema.simVersions.simId, id))
    .orderBy(desc(schema.simVersions.createdAt))
    .limit(20);
  return (
    <SimReview
      id={id}
      status={sim.row.status}
      spec={sim.spec}
      sources={sim.row.sources as { title: string; lecture: string | null; pageNo: number }[]}
      versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
    />
  );
}
