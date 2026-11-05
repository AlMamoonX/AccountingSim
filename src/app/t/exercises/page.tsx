import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Badge, PageTitle, fmtDay } from "@/components/ui/bits";
import { ConfirmButton, SubmitButton } from "@/components/ui/client";
import { addSampleExercise, copyExercise, deleteExercise } from "@/app/actions/teacher";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "drafts", label: "Drafts" },
] as const;

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "all" } = await searchParams;
  const db = await getDb();
  const base = db
    .select({
      id: schema.exercises.id,
      title: schema.exercises.title,
      business: schema.exercises.businessName,
      status: schema.exercises.status,
      createdAt: schema.exercises.createdAt,
      parts: sql<number>`jsonb_array_length(${schema.exercises.spec}->'parts')`,
      used: sql<number>`(select count(*)::int from assignments a where a.exercise_id = ${schema.exercises.id})`,
    })
    .from(schema.exercises);
  const rows = await (f === "ready"
    ? base.where(eq(schema.exercises.status, "published"))
    : f === "drafts"
      ? base.where(eq(schema.exercises.status, "draft"))
      : base
  ).orderBy(desc(schema.exercises.updatedAt));

  return (
    <div className="stack">
      <div className="row-between">
        <PageTitle title="My exercises" />
        <Link href="/t/exercises/new" className="btn btn-special rise rise-2">
          ✦ Create exercise
        </Link>
      </div>
      <nav className="tabs rise rise-2" aria-label="Filter" style={{ alignSelf: "flex-start" }}>
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/t/exercises" : `/t/exercises?f=${x.key}`}
            aria-current={f === x.key ? "page" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              padding: "0 18px",
              borderRadius: 999,
              fontWeight: 700,
              textDecoration: "none",
              background: f === x.key ? "var(--ink)" : undefined,
              color: f === x.key ? "var(--bg)" : undefined,
            }}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 && (
        <div className="card small stack-sm">
          <p className="muted">No exercises here yet.</p>
          <form action={addSampleExercise}>
            <SubmitButton className="btn btn-secondary btn-small" busy="Adding…">
              Add the Karak sample (Lecture 5)
            </SubmitButton>
          </form>
        </div>
      )}
      <div className="grid-auto">
        {rows.map((r, i) => (
          <article key={r.id} className={`card small rise rise-${Math.min(5, i + 2)}`}>
            <div className="stack-sm">
              <div className="row">
                {r.status === "published" ? <Badge kind="ready">Ready</Badge> : <Badge kind="draft">Draft</Badge>}
                <Badge kind="plain">
                  {r.parts} {r.parts === 1 ? "part" : "parts"}
                </Badge>
              </div>
              <h3>{r.title}</h3>
              <p className="muted">
                {r.business} · {fmtDay(r.createdAt)} · assigned {r.used}×
              </p>
              <div className="row">
                <Link href={`/t/exercises/${r.id}`} className="btn btn-primary btn-small" style={{ minHeight: 44 }}>
                  Open
                </Link>
                <form action={copyExercise.bind(null, r.id)}>
                  <SubmitButton className="btn btn-secondary btn-small" busy="Copying…">
                    Copy
                  </SubmitButton>
                </form>
                {r.status === "draft" && r.used === 0 && (
                  <form>
                    <ConfirmButton
                      className="btn-text danger"
                      label="Delete"
                      question={`Delete the draft “${r.title}”?`}
                      confirmLabel="Delete"
                      formAction={deleteExercise.bind(null, r.id)}
                    />
                  </form>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
