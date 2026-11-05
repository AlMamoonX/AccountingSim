import Link from "next/link";
import { notFound } from "next/navigation";
import { loadGradebook, STATUS_LABEL } from "@/lib/gradebook";
import { buildView, grade, paramsForSeed, type StudentAnswers } from "@/lib/spec/engine";
import { PageTitle, Progress, fmtDate } from "@/components/ui/bits";
import { ResultSheet } from "@/components/sheet/ResultSheet";

export default async function StudentAnswersPage({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { id, studentId } = await params;
  const gb = await loadGradebook(id);
  if (!gb) notFound();
  const idx = gb.rows.findIndex((r) => r.studentId === studentId);
  const row = gb.rows[idx];
  if (!row || !row.sub) notFound();
  const withWork = gb.rows.filter((r) => r.sub);
  const pos = withWork.findIndex((r) => r.studentId === studentId);
  const prev = withWork[pos - 1];
  const next = withWork[pos + 1];

  const params2 = paramsForSeed(gb.spec, row.sub.seed);
  const g = grade(gb.spec, params2, row.sub.answers as StudentAnswers);
  const view = buildView(gb.spec, params2);

  return (
    <div className="stack">
      <div className="row-between">
        <PageTitle title={row.email} sub={`${gb.ex.title} · ${STATUS_LABEL[row.status]}${row.submittedAt ? ` ${fmtDate(row.submittedAt)}` : ""}`} />
        <div className="row rise rise-2">
          {prev && (
            <Link className="btn btn-secondary btn-small" href={`/t/assignments/${id}/students/${prev.studentId}`}>
              ← Previous
            </Link>
          )}
          <Link className="btn btn-secondary btn-small" href={`/t/assignments/${id}`}>
            All marks
          </Link>
          {next && (
            <Link className="btn btn-secondary btn-small" href={`/t/assignments/${id}/students/${next.studentId}`}>
              Next →
            </Link>
          )}
        </div>
      </div>
      <div className="grid-2">
        <div className="card ink rise rise-2">
          <p className="label muted">{row.status === "handed_in" ? "Total mark" : "Mark if handed in now"}</p>
          <p className="big-num">
            {g.score}
            <span style={{ fontSize: 28 }}>/{g.max}</span>
          </p>
        </div>
        <div className="card rise rise-3">
          <div className="stack-sm">
            {g.parts.map((p, i) => (
              <div key={p.partId} className="stack-sm" style={{ gap: 6 }}>
                <div className="row-between">
                  <span className="label">
                    {String.fromCharCode(65 + i)} · {p.title}
                  </span>
                  <span className="mono">
                    {p.score}/{p.max}
                  </span>
                </div>
                <Progress value={p.max ? p.score / p.max : 0} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {gb.a.variantMode === "unique" && <p className="hint">This student had their own numbers.</p>}
      <ResultSheet view={view} answers={row.sub.answers as StudentAnswers} result={g} />
    </div>
  );
}
