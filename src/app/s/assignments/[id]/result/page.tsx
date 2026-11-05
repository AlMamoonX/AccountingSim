import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { assignmentState, studentAssignment } from "@/lib/data";
import { buildView, grade, paramsForSeed, type StudentAnswers } from "@/lib/spec/engine";
import { Badge, PageTitle, Progress, fmtDate } from "@/components/ui/bits";
import { CountUp } from "@/components/ui/client";
import { ResultSheet } from "@/components/sheet/ResultSheet";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStudent();
  const data = await studentAssignment(id, me.id);
  if (!data) notFound();
  const { a, spec, sub } = data;
  const st = assignmentState(a, sub);

  if (!st.submitted && !st.closed) {
    return (
      <div className="stack">
        <PageTitle title="Not handed in yet" />
        <Link className="btn btn-primary" href={`/s/assignments/${id}`} style={{ alignSelf: "flex-start" }}>
          Continue the exercise
        </Link>
      </div>
    );
  }

  if (!st.resultsVisible) {
    return (
      <div className="stack">
        <PageTitle title="Handed in" sticker="Done" sub={spec.title} />
        <div className="card hero">
          <p className="card-title">Mark after {fmtDate(a.deadline)}</p>
          <p className="muted">This is graded work. Your doctor&apos;s settings show marks once the deadline has passed.</p>
        </div>
        <Link className="btn btn-primary" href="/s" style={{ alignSelf: "flex-start" }}>
          Back to my assignments
        </Link>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="stack">
        <PageTitle title="Not handed in" sub={spec.title} />
        <p className="card small">You didn&apos;t start this assignment before the deadline.</p>
      </div>
    );
  }

  const params2 = paramsForSeed(spec, sub.seed);
  const g = grade(spec, params2, sub.answers as StudentAnswers);
  const view = buildView(spec, params2);
  const handedIn = sub.status === "submitted";
  const score = handedIn ? (sub.score ?? g.score) : 0;
  const max = handedIn ? (sub.maxScore ?? g.max) : g.max;

  return (
    <div className="stack">
      <PageTitle title={handedIn ? "My result" : "Not handed in"} sticker={handedIn && max && score / max >= 0.8 ? "Great work" : undefined} sub={spec.title} />
      <div className="grid-2">
        <div className="card ink rise rise-2">
          <p className="label muted">{handedIn ? "Your mark" : "Not handed in: no mark"}</p>
          <p className="big-num" style={{ fontSize: 72 }}>
            <CountUp value={score} />
            <span style={{ fontSize: 32 }}>/{max}</span>
          </p>
          {handedIn && sub.submittedAt && <p className="muted">Handed in {fmtDate(sub.submittedAt)}</p>}
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
                <Progress value={p.max ? p.score / p.max : 0} color={i % 2 ? "teal" : undefined} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="row">
        <Badge kind="practice">✓ right</Badge>
        <Badge kind="error">× wrong, correct answer underneath</Badge>
      </div>
      <ResultSheet view={view} answers={sub.answers as StudentAnswers} result={g} />
      <Link className="btn btn-primary" href="/s" style={{ alignSelf: "flex-start" }}>
        Back to my assignments
      </Link>
    </div>
  );
}
