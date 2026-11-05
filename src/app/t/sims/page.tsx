import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Badge, PageTitle, fmtDate } from "@/components/ui/bits";
import { ConfirmButton, SubmitButton } from "@/components/ui/client";
import { addSampleSim, copySim, deleteSim } from "@/app/actions/sim";

export default async function SimsPage() {
  const db = await getDb();
  const sims = await db
    .select({
      id: schema.sims.id,
      title: schema.sims.title,
      business: schema.sims.businessName,
      status: schema.sims.status,
      months: sql<number>`(${schema.sims.spec}->>'months')::int`,
      runs: sql<number>`(select count(*)::int from sim_runs r where r.sim_id = ${schema.sims.id})`,
    })
    .from(schema.sims)
    .orderBy(desc(schema.sims.updatedAt));
  const runs = await db
    .select({ id: schema.simRuns.id, title: schema.sims.title, cls: schema.classes.name, month: schema.simRuns.openedMonth, deadline: schema.simRuns.deadline, ended: schema.simRuns.endedAt, months: sql<number>`(${schema.sims.spec}->>'months')::int` })
    .from(schema.simRuns)
    .innerJoin(schema.sims, eq(schema.sims.id, schema.simRuns.simId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.simRuns.classId))
    .orderBy(desc(schema.simRuns.createdAt));
  const now = new Date();

  return (
    <div className="stack">
      <div className="row-between">
        <PageTitle title="Simulations" sticker="Game" sub="Students run a company month by month: they decide, face events, keep the books and compete on a leaderboard." />
        <Link href="/t/sims/new" className="btn btn-special rise rise-2">
          ✦ Create simulation
        </Link>
      </div>

      {runs.length > 0 && (
        <section className="stack-sm rise rise-2">
          <h2>Running in classes</h2>
          <div className="grid-auto">
            {runs.map((r) => {
              const over = !!r.ended || r.deadline < now;
              return (
                <Link key={r.id} href={`/t/sim-runs/${r.id}`} className="card small lift">
                  <div className="stack-sm">
                    <div className="row">
                      {over ? <Badge kind="plain">Ended</Badge> : <Badge kind="ready">Month {r.month} of {r.months}</Badge>}
                    </div>
                    <h3>{r.title}</h3>
                    <p className="muted">
                      {r.cls} · ends <span className="mono">{fmtDate(r.deadline)}</span>
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="stack-sm rise rise-3">
        <h2>My simulations</h2>
        {sims.length === 0 && (
          <div className="card small stack-sm">
            <p className="muted">No simulations yet.</p>
            <form action={addSampleSim}>
              <SubmitButton className="btn btn-secondary btn-small" busy="Adding…">
                Add the sample sim (Karak Corner, 4 months)
              </SubmitButton>
            </form>
          </div>
        )}
        <div className="grid-auto">
          {sims.map((s) => (
            <article key={s.id} className="card small">
              <div className="stack-sm">
                <div className="row">
                  {s.status === "published" ? <Badge kind="ready">Ready</Badge> : <Badge kind="draft">Draft</Badge>}
                  <Badge kind="plain">{s.months} months</Badge>
                </div>
                <h3>{s.title}</h3>
                <p className="muted">
                  {s.business} · used {s.runs}×
                </p>
                <div className="row">
                  <Link href={`/t/sims/${s.id}`} className="btn btn-primary btn-small" style={{ minHeight: 44 }}>
                    Open
                  </Link>
                  <form action={copySim.bind(null, s.id)}>
                    <SubmitButton className="btn btn-secondary btn-small" busy="Copying…">
                      Copy
                    </SubmitButton>
                  </form>
                  {s.status === "draft" && s.runs === 0 && (
                    <form>
                      <ConfirmButton className="btn-text danger" label="Delete" question={`Delete the draft “${s.title}”?`} confirmLabel="Delete" formAction={deleteSim.bind(null, s.id)} />
                    </form>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        {sims.length > 0 && (
          <form action={addSampleSim}>
            <SubmitButton className="btn-text" busy="Adding…">
              + Add the sample sim
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
