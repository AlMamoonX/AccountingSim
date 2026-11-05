import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { assignmentState } from "@/lib/data";
import { Badge, PageTitle, Progress, fmtDate, pct } from "@/components/ui/bits";
import { JoinForm } from "./JoinForm";

export default async function StudentHome() {
  const me = await requireStudent();
  const db = await getDb();
  const rows = await db
    .select({ a: schema.assignments, title: schema.exercises.title, business: schema.exercises.businessName, className: schema.classes.name, sub: schema.submissions })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
    .innerJoin(schema.assignments, eq(schema.assignments.classId, schema.classes.id))
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.assignments.exerciseId))
    .leftJoin(schema.submissions, and(eq(schema.submissions.assignmentId, schema.assignments.id), eq(schema.submissions.studentId, me.id)))
    .where(eq(schema.enrollments.studentId, me.id))
    .orderBy(schema.assignments.deadline);
  const classes = await db
    .select({ name: schema.classes.name })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
    .where(eq(schema.enrollments.studentId, me.id));

  const items = rows.map((r) => ({ ...r, st: assignmentState(r.a, r.sub) }));
  const simRuns = await db
    .select({ run: schema.simRuns, title: schema.sims.title, months: sql<number>`(${schema.sims.spec}->>'months')::int`, className: schema.classes.name })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.enrollments.classId))
    .innerJoin(schema.simRuns, eq(schema.simRuns.classId, schema.classes.id))
    .innerJoin(schema.sims, eq(schema.sims.id, schema.simRuns.simId))
    .where(eq(schema.enrollments.studentId, me.id));
  const now = new Date();
  const todo = items.filter((i) => !i.st.submitted && !i.st.closed);
  const handed = items.filter((i) => i.st.submitted).reverse();
  const closed = items.filter((i) => !i.st.submitted && i.st.closed).reverse();

  return (
    <div className="stack">
      <PageTitle title="My assignments" sub={classes.length ? `Classes: ${classes.map((c) => c.name).join(", ")}` : "Join your class to see your assignments."} />
      <JoinForm />

      {simRuns.length > 0 && (
        <section className="stack-sm rise rise-3">
          <h2>Company simulations</h2>
          <div className="grid-auto">
            {simRuns.map(({ run, title, months, className }) => {
              const over = !!run.endedAt || run.deadline < now;
              return (
                <Link key={run.id} href={`/s/sims/${run.id}`} className="card hero lift" style={{ background: "var(--t-purple)" }}>
                  <div className="stack-sm">
                    <span className="sticker" style={{ alignSelf: "flex-start" }}>
                      {over ? "Final results" : `Month ${Math.min(run.openedMonth, months)} of ${months}`}
                    </span>
                    <h3>{title}</h3>
                    <p className="muted">{className}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="stack-sm rise rise-3">
        <h2>To do</h2>
        {todo.length === 0 && <p className="card small muted">Nothing to do right now.</p>}
        <div className="grid-auto">
          {todo.map(({ a, title, business, className, sub, st }) => (
            <article key={a.id} className="card hero lift">
              <div className="stack-sm">
                <div className="row">
                  <Badge kind={a.mode === "practice" ? "practice" : "graded"}>{a.mode === "practice" ? "Practice" : "Graded"}</Badge>
                  {!st.opened && <Badge kind="plain">Opens {fmtDate(a.opensAt)}</Badge>}
                </div>
                <h3>{title}</h3>
                <p className="muted">
                  {business} · {className}
                </p>
                <p className="label">
                  Due <span className="mono">{fmtDate(a.deadline)}</span>
                </p>
                <Progress value={sub?.progress ?? 0} />
                {st.opened ? (
                  <Link href={`/s/assignments/${a.id}`} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
                    {sub ? "Continue" : "Start"}
                  </Link>
                ) : (
                  <span className="hint">Not open yet.</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="stack-sm rise rise-4">
        <h2>Handed in</h2>
        {handed.length === 0 && <p className="card small muted">Nothing handed in yet.</p>}
        <div className="grid-auto">
          {handed.map(({ a, title, sub, st }) => (
            <Link key={a.id} href={`/s/assignments/${a.id}/result`} className="card small lift">
              <div className="stack-sm">
                <Badge kind="ready">Handed in</Badge>
                <h3>{title}</h3>
                {st.resultsVisible ? (
                  <p className="big-num" style={{ fontSize: 40 }}>
                    {sub?.score}/{sub?.maxScore} <span style={{ fontSize: 18 }}>{pct(sub?.score, sub?.maxScore)}</span>
                  </p>
                ) : (
                  <p className="label">Mark after {fmtDate(a.deadline)}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {closed.length > 0 && (
        <section className="stack-sm rise rise-5">
          <h2>Closed</h2>
          <div className="grid-auto">
            {closed.map(({ a, title }) => (
              <Link key={a.id} href={`/s/assignments/${a.id}/result`} className="card small lift">
                <div className="stack-sm">
                  <Badge kind="error">Not handed in</Badge>
                  <h3>{title}</h3>
                  <p className="muted">Closed {fmtDate(a.deadline)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
