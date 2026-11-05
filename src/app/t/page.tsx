import Link from "next/link";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Badge, PageTitle, Progress, fmtDate } from "@/components/ui/bits";

export default async function DoctorHome() {
  const db = await getDb();
  const [{ classes, students }] = await db
    .select({
      classes: sql<number>`count(distinct ${schema.classes.id})::int`,
      students: sql<number>`count(distinct ${schema.enrollments.studentId})::int`,
    })
    .from(schema.classes)
    .leftJoin(schema.enrollments, eq(schema.enrollments.classId, schema.classes.id))
    .where(eq(schema.classes.archived, false));
  const drafts = await db
    .select({ id: schema.exercises.id, title: schema.exercises.title, business: schema.exercises.businessName, warnings: schema.exercises.warnings, createdAt: schema.exercises.createdAt })
    .from(schema.exercises)
    .where(eq(schema.exercises.status, "draft"))
    .orderBy(desc(schema.exercises.updatedAt))
    .limit(6);
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const current = await db
    .select({
      id: schema.assignments.id,
      deadline: schema.assignments.deadline,
      mode: schema.assignments.mode,
      title: schema.exercises.title,
      className: schema.classes.name,
      size: sql<number>`(select count(*)::int from enrollments e where e.class_id = ${schema.assignments.classId})`,
      handedIn: sql<number>`(select count(*)::int from submissions s where s.assignment_id = ${schema.assignments.id} and s.status = 'submitted')`,
    })
    .from(schema.assignments)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.assignments.exerciseId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
    .where(and(gt(schema.assignments.deadline, weekAgo)))
    .orderBy(schema.assignments.deadline);
  const now = new Date();

  return (
    <div className="stack">
      <PageTitle title="Doctor home" sticker="CS2 145" />
      <div className="grid-3">
        <div className="card ink rise rise-1">
          <p className="label muted">Classes</p>
          <p className="big-num">{classes}</p>
        </div>
        <div className="card ink rise rise-2">
          <p className="label muted">Students</p>
          <p className="big-num">{students}</p>
        </div>
        <div className="card ink rise rise-3">
          <p className="label muted">Drafts to check</p>
          <p className="big-num">{drafts.length}</p>
        </div>
      </div>

      <div className="grid-3">
        <Link href="/t/exercises/new" className="card hero lift rise rise-2" style={{ background: "var(--pink)" }}>
          <div className="stack-sm">
            <span style={{ fontSize: 34 }} aria-hidden>✦</span>
            <h3>Create exercise</h3>
            <p>Describe it in your words. The AI writes the business, transactions and answer key.</p>
          </div>
        </Link>
        <Link href="/t/lectures" className="card hero lift rise rise-3" style={{ background: "var(--teal)" }}>
          <div className="stack-sm">
            <span style={{ fontSize: 34 }} aria-hidden>⬆</span>
            <h3>Upload lecture slides</h3>
            <p>The AI follows your slides when it makes exercises.</p>
          </div>
        </Link>
        <Link href="/t/classes" className="card hero lift rise rise-4">
          <div className="stack-sm">
            <span style={{ fontSize: 34 }} aria-hidden>＋</span>
            <h3>Create class</h3>
            <p>Get a class code for students to join.</p>
          </div>
        </Link>
      </div>

      <section className="stack-sm rise rise-4">
        <h2>AI drafts waiting for a check</h2>
        {drafts.length === 0 ? (
          <p className="card small muted">Nothing waiting. New AI exercises appear here until you publish them.</p>
        ) : (
          <div className="grid-auto">
            {drafts.map((d) => (
              <Link key={d.id} href={`/t/exercises/${d.id}`} className="card small lift">
                <div className="stack-sm">
                  <div className="row">
                    <Badge kind="draft">Draft</Badge>
                    {(d.warnings as string[]).length > 0 && <Badge kind="error">{(d.warnings as string[]).length} to look at</Badge>}
                  </div>
                  <h3>{d.title}</h3>
                  <p className="muted">{d.business}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="stack-sm rise rise-5">
        <h2>Current assignments</h2>
        {current.length === 0 ? (
          <p className="card small muted">No assignments yet. Open an exercise and press “Give to a class”.</p>
        ) : (
          <div className="grid-auto">
            {current.map((a) => (
              <Link key={a.id} href={`/t/assignments/${a.id}`} className="card small lift">
                <div className="stack-sm">
                  <div className="row">
                    <Badge kind={a.mode === "practice" ? "practice" : "graded"}>{a.mode === "practice" ? "Practice" : "Graded"}</Badge>
                    {a.deadline < now ? <Badge kind="plain">Closed</Badge> : <Badge kind="ready">Open</Badge>}
                  </div>
                  <h3>{a.title}</h3>
                  <p className="muted">
                    {a.className} · due <span className="mono">{fmtDate(a.deadline)}</span>
                  </p>
                  <Progress value={a.size ? a.handedIn / a.size : 0} color="teal" />
                  <p className="label">
                    <span className="mono">
                      {a.handedIn} / {a.size}
                    </span>{" "}
                    handed in
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
