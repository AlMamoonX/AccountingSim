import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageTitle } from "@/components/ui/bits";
import { CopyButton, SubmitButton, ConfirmButton } from "@/components/ui/client";
import { createClass, newClassCode, renameClass, setClassArchived } from "@/app/actions/teacher";

export default async function ClassesPage() {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      code: schema.classes.joinCode,
      archived: schema.classes.archived,
      students: sql<number>`(select count(*)::int from enrollments e where e.class_id = ${schema.classes.id})`,
      active: sql<number>`(select count(*)::int from assignments a where a.class_id = ${schema.classes.id} and a.deadline > now())`,
    })
    .from(schema.classes)
    .orderBy(desc(schema.classes.createdAt));
  const open = rows.filter((r) => !r.archived);
  const closed = rows.filter((r) => r.archived);

  return (
    <div className="stack">
      <PageTitle title="My classes" sub="Give each class its code. Students type it after signing in to join." />

      <form action={createClass} className="card hero rise rise-2">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 260px" }}>
            <span className="label">New class name</span>
            <input className="input" name="name" required maxLength={120} placeholder="e.g. CS2 145 · Section A · Fall 2026" />
          </label>
          <SubmitButton busy="Creating…">Create class</SubmitButton>
        </div>
      </form>

      {open.length === 0 && <p className="card small muted">No classes yet.</p>}
      <div className="grid-auto">
        {open.map((c, i) => (
          <article key={c.id} className={`card rise rise-${Math.min(5, i + 2)}`}>
            <div className="stack-sm">
              <Link href={`/t/classes/${c.id}`} style={{ textDecoration: "none" }}>
                <h3>{c.name}</h3>
              </Link>
              <p className="muted">
                <span className="mono">{c.students}</span> students · <span className="mono">{c.active}</span> open assignments
              </p>
              <div className="row" style={{ background: "var(--t-yellow)", borderRadius: 18, padding: "10px 14px" }}>
                <span className="label">Class code</span>
                <span className="mono" style={{ fontSize: 26, letterSpacing: ".15em", fontWeight: 500 }}>
                  {c.code}
                </span>
                <span className="spacer" />
                <CopyButton text={c.code} />
              </div>
              <details>
                <summary className="btn-text" style={{ display: "inline-flex" }}>
                  Rename
                </summary>
                <form action={renameClass.bind(null, c.id)} className="row" style={{ marginTop: 8 }}>
                  <input className="input" name="name" defaultValue={c.name} aria-label="Class name" required style={{ flex: "1 1 180px" }} />
                  <SubmitButton className="btn btn-secondary btn-small">Save</SubmitButton>
                </form>
              </details>
              <div className="row">
                <Link href={`/t/classes/${c.id}`} className="btn btn-secondary btn-small">
                  Open
                </Link>
                <form>
                  <ConfirmButton
                    className="btn-text"
                    label="New code"
                    question="Make a new code? The old one stops working."
                    confirmLabel="New code"
                    formAction={newClassCode.bind(null, c.id)}
                  />
                </form>
                <form>
                  <ConfirmButton
                    className="btn-text danger"
                    label="Close class"
                    question="Close this class? Students can't join it any more. You can reopen it."
                    confirmLabel="Close class"
                    formAction={setClassArchived.bind(null, c.id, true)}
                  />
                </form>
              </div>
            </div>
          </article>
        ))}
      </div>

      {closed.length > 0 && (
        <section className="stack-sm">
          <h2>Closed classes</h2>
          <div className="table-wrap">
            <table className="list">
              <tbody>
                {closed.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/t/classes/${c.id}`}>{c.name}</Link>
                    </td>
                    <td className="num">{c.students} students</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={setClassArchived.bind(null, c.id, false)}>
                        <SubmitButton className="btn btn-secondary btn-small">Reopen</SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
