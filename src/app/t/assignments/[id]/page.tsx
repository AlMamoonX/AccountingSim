import Link from "next/link";
import { notFound } from "next/navigation";
import { classStats, loadGradebook, STATUS_LABEL } from "@/lib/gradebook";
import { Badge, PageTitle, Progress, fmtDate, pct } from "@/components/ui/bits";
import { ConfirmButton, SubmitButton } from "@/components/ui/client";
import { changeDeadline, closeAssignmentNow } from "@/app/actions/teacher";

const muscatLocal = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16);

export default async function MarksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gb = await loadGradebook(id);
  if (!gb) notFound();
  const { a, ex, cls, rows, spec, closed } = gb;
  const stats = classStats(spec, rows);
  const scored = rows.filter((r) => r.status === "handed_in" && r.max);
  const avg = scored.length ? scored.reduce((s, r) => s + r.score! / r.max!, 0) / scored.length : null;

  return (
    <div className="stack">
      <div className="row-between">
        <PageTitle title="Marks" sub={`${ex.title} · ${cls.name}`} />
        <div className="row rise rise-2">
          <Badge kind={a.mode === "practice" ? "practice" : "graded"}>{a.mode === "practice" ? "Practice" : "Graded"}</Badge>
          <Badge kind="plain">{a.variantMode === "unique" ? "Own numbers" : "Same numbers"}</Badge>
          {closed ? <Badge kind="info">Closed</Badge> : <Badge kind="ready">Open</Badge>}
        </div>
      </div>

      <div className="grid-3">
        <div className="card ink rise rise-1">
          <p className="label muted">Handed in</p>
          <p className="big-num">
            {stats.handedIn}
            <span style={{ fontSize: 28 }}>/{rows.length}</span>
          </p>
        </div>
        <div className="card ink rise rise-2">
          <p className="label muted">Class average</p>
          <p className="big-num">{avg == null ? "–" : `${Math.round(avg * 100)}%`}</p>
        </div>
        <div className="card rise rise-3">
          <div className="stack-sm">
            <p className="label">Deadline</p>
            <p className="mono" style={{ fontSize: 20 }}>
              {fmtDate(a.deadline)}
            </p>
            <details>
              <summary className="btn-text" style={{ display: "inline-flex" }}>
                Change
              </summary>
              <form action={changeDeadline.bind(null, id)} className="row" style={{ marginTop: 6 }}>
                <input className="input mono" type="datetime-local" name="deadline" defaultValue={muscatLocal(a.deadline)} aria-label="New deadline (Muscat time)" required />
                <SubmitButton className="btn btn-secondary btn-small">Save</SubmitButton>
              </form>
            </details>
            {!closed && (
              <form>
                <ConfirmButton
                  className="btn-text danger"
                  label="Close now"
                  question="Close now? Students can't hand in any more, and graded marks are shown to them."
                  confirmLabel="Close now"
                  formAction={closeAssignmentNow.bind(null, id)}
                />
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="card rise rise-3">
          <div className="stack-sm">
            <h2>Parts</h2>
            {stats.parts.map((p, i) => (
              <div key={p.partId} className="stack-sm" style={{ gap: 6 }}>
                <div className="row-between">
                  <span className="label">
                    {String.fromCharCode(65 + i)} · {p.title}
                  </span>
                  <span className="mono">{p.avg == null ? "–" : `${Math.round(p.avg * 100)}%`}</span>
                </div>
                <Progress value={p.avg ?? 0} />
              </div>
            ))}
          </div>
        </section>
        <section className="card rise rise-4">
          <div className="stack-sm">
            <h2>Most missed</h2>
            {stats.mostMissed.length === 0 && <p className="muted">Nothing yet. This fills in as students hand in.</p>}
            {stats.mostMissed.map((m) => (
              <div key={m.label} className="stack-sm" style={{ gap: 6 }}>
                <div className="row-between">
                  <span className="label">{m.label}</span>
                  <span className="mono">
                    {m.wrong}/{m.total}
                  </span>
                </div>
                <Progress value={m.rate} color="pink" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="stack-sm rise rise-5">
        <div className="row-between">
          <h2>Students</h2>
          <a className="btn btn-teal" href={`/t/assignments/${id}/export`} download>
            Download Excel
          </a>
        </div>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th className="num">Mark</th>
                <th>Handed in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No students in this class yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <td className="mono">{r.email}</td>
                  <td>
                    {r.status === "handed_in" && <Badge kind="ready">{STATUS_LABEL[r.status]}</Badge>}
                    {r.status === "in_progress" && <Badge kind="info">In progress · {Math.round(r.progress * 100)}%</Badge>}
                    {r.status === "not_started" && <Badge kind="plain">{STATUS_LABEL[r.status]}</Badge>}
                    {r.status === "missed" && <Badge kind="error">{STATUS_LABEL[r.status]}</Badge>}
                  </td>
                  <td className="num">
                    {r.score == null ? "–" : `${r.score}/${r.max}`} <span className="muted">{r.score == null ? "" : pct(r.score, r.max)}</span>
                  </td>
                  <td>{r.submittedAt ? fmtDate(r.submittedAt) : "–"}</td>
                  <td style={{ textAlign: "right" }}>
                    {r.sub && (
                      <Link className="btn btn-secondary btn-small" href={`/t/assignments/${id}/students/${r.studentId}`}>
                        View
                      </Link>
                    )}
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
