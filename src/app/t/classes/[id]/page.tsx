import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isUuid } from "@/lib/data";
import { Badge, PageTitle, fmtDate, fmtDay } from "@/components/ui/bits";
import { ConfirmButton, CopyButton } from "@/components/ui/client";
import { removeStudent } from "@/app/actions/teacher";

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, id));
  if (!cls) notFound();
  const assignments = await db
    .select({
      id: schema.assignments.id,
      title: schema.exercises.title,
      deadline: schema.assignments.deadline,
      mode: schema.assignments.mode,
      handedIn: sql<number>`(select count(*)::int from submissions s where s.assignment_id = ${schema.assignments.id} and s.status = 'submitted')`,
    })
    .from(schema.assignments)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.assignments.exerciseId))
    .where(eq(schema.assignments.classId, id))
    .orderBy(desc(schema.assignments.deadline));
  const students = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      joinedAt: schema.enrollments.joinedAt,
      done: sql<number>`(select count(*)::int from submissions s join assignments a on a.id = s.assignment_id where a.class_id = ${id} and s.student_id = ${schema.users.id} and s.status = 'submitted')`,
      avg: sql<number | null>`(select avg(s.score / nullif(s.max_score, 0)) from submissions s join assignments a on a.id = s.assignment_id where a.class_id = ${id} and s.student_id = ${schema.users.id} and s.status = 'submitted')`,
    })
    .from(schema.enrollments)
    .innerJoin(schema.users, eq(schema.users.id, schema.enrollments.studentId))
    .where(eq(schema.enrollments.classId, id))
    .orderBy(schema.users.email);
  const now = new Date();

  return (
    <div className="stack">
      <PageTitle
        title={cls.name}
        sticker={cls.archived ? "Closed" : undefined}
        sub={
          <span className="row">
            Class code{" "}
            <span className="mono" style={{ fontSize: 22, letterSpacing: ".15em" }}>
              {cls.joinCode}
            </span>{" "}
            <CopyButton text={cls.joinCode} />
          </span>
        }
      />
      <section className="stack-sm rise rise-2">
        <h2>Assignments</h2>
        {assignments.length === 0 ? (
          <p className="card small muted">None yet. Open an exercise and press “Give to a class”.</p>
        ) : (
          <div className="grid-auto">
            {assignments.map((a) => (
              <Link key={a.id} href={`/t/assignments/${a.id}`} className="card small lift">
                <div className="stack-sm">
                  <div className="row">
                    <Badge kind={a.mode === "practice" ? "practice" : "graded"}>{a.mode === "practice" ? "Practice" : "Graded"}</Badge>
                    {a.deadline < now ? <Badge kind="plain">Closed</Badge> : <Badge kind="ready">Open</Badge>}
                  </div>
                  <h3>{a.title}</h3>
                  <p className="muted">
                    Due <span className="mono">{fmtDate(a.deadline)}</span> ·{" "}
                    <span className="mono">
                      {a.handedIn}/{students.length}
                    </span>{" "}
                    handed in
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="stack-sm rise rise-3">
        <h2>Students ({students.length})</h2>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Email</th>
                <th>Joined</th>
                <th className="num">Done</th>
                <th className="num">Average</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No students yet. Share the class code.
                  </td>
                </tr>
              )}
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.email}</td>
                  <td>{fmtDay(s.joinedAt)}</td>
                  <td className="num">{s.done}</td>
                  <td className="num">{s.avg == null ? "–" : `${Math.round(Number(s.avg) * 100)}%`}</td>
                  <td style={{ textAlign: "right" }}>
                    <form>
                      <ConfirmButton
                        className="btn-text danger"
                        label="Remove"
                        question={`Remove ${s.email} from this class?`}
                        confirmLabel="Remove"
                        formAction={removeStudent.bind(null, id, s.id)}
                      />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
