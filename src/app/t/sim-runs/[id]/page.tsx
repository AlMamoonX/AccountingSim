import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { leaderboard, loadRun, runState } from "@/lib/sim/data";
import { monthLabel } from "@/lib/sim/engine";
import { Badge, PageTitle, Progress, fmtDate } from "@/components/ui/bits";
import { ConfirmButton } from "@/components/ui/client";
import { Leaderboard } from "@/components/sim/SimBits";
import { endRunForm, openNextMonthForm } from "@/app/actions/sim";
import { MonthWorkEditor } from "./MonthWorkEditor";

export default async function ControlRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadRun(id);
  if (!data) notFound();
  const { run, spec, cls } = data;
  const st = runState(run, spec);
  const db = await getDb();
  const enrolled = await db.select({ id: schema.enrollments.studentId }).from(schema.enrollments).where(eq(schema.enrollments.classId, run.classId));
  const board = await leaderboard(run, spec);
  const ids = board.map((b) => b.player.id);
  const thisMonth = ids.length
    ? await db
        .select({ playerId: schema.simMonths.playerId, step: schema.simMonths.step })
        .from(schema.simMonths)
        .where(and(inArray(schema.simMonths.playerId, ids), eq(schema.simMonths.month, run.openedMonth)))
    : [];
  const done = thisMonth.filter((m) => m.step === "done").length;
  const recording = thisMonth.filter((m) => m.step === "record").length;
  const notFinished = enrolled.length - done;

  return (
    <div className="stack">
      <div className="row-between">
        <PageTitle title="Control room" sub={`${spec.title} · ${cls.name}`} />
        <div className="row rise rise-2">
          {st.ended ? <Badge kind="plain">Ended</Badge> : <Badge kind="ready">{monthLabel(spec, run.openedMonth)} open</Badge>}
          <Badge kind="info">
            {run.accountingWeight}% books / {100 - run.accountingWeight}% business
          </Badge>
        </div>
      </div>

      <div className="grid-3">
        <div className="card ink">
          <p className="label muted">Month</p>
          <p className="big-num">
            {run.openedMonth}
            <span style={{ fontSize: 28 }}>/{spec.months}</span>
          </p>
        </div>
        <div className="card ink">
          <p className="label muted">Finished {monthLabel(spec, run.openedMonth)}</p>
          <p className="big-num">
            {done}
            <span style={{ fontSize: 28 }}>/{enrolled.length}</span>
          </p>
          <Progress value={enrolled.length ? done / enrolled.length : 0} color="teal" />
          {recording > 0 && <p className="muted">{recording} decided, still recording</p>}
        </div>
        <div className="card stack-sm">
          <p className="label">Ends</p>
          <p className="mono">{fmtDate(run.deadline)}</p>
          {!st.ended && !st.lastMonth && (
            <form>
              <ConfirmButton
                className="btn btn-special"
                label={`Open ${monthLabel(spec, run.openedMonth + 1)}`}
                question={
                  notFinished > 0
                    ? `${notFinished} student${notFinished === 1 ? " hasn't" : "s haven't"} finished ${monthLabel(spec, run.openedMonth)}. Their month will be auto-played on default decisions with 0 marks for the books. Open ${monthLabel(spec, run.openedMonth + 1)}?`
                    : `Everyone has finished. Open ${monthLabel(spec, run.openedMonth + 1)}?`
                }
                confirmLabel="Open it"
                formAction={openNextMonthForm.bind(null, id)}
              />
            </form>
          )}
          {!st.ended && (
            <form>
              <ConfirmButton
                className="btn-text danger"
                label="End the simulation now"
                question="End now? Unfinished months are auto-played and final marks are fixed."
                confirmLabel="End it"
                formAction={endRunForm.bind(null, id)}
              />
            </form>
          )}
        </div>
      </div>

      {!st.ended && !st.lastMonth && <MonthWorkEditor key={run.openedMonth} runId={id} openedMonth={run.openedMonth} spec={spec} />}

      <section className="stack-sm">
        <div className="row-between">
          <h2>Leaderboard</h2>
          <a className="btn btn-teal" href={`/t/sim-runs/${id}/export`} download>
            Download Excel
          </a>
        </div>
        <p className="hint">Business: {spec.score.label}. Books: share of bookkeeping marks so far. Students only see company names.</p>
        <Leaderboard
          showEmail
          scoreLabel={spec.score.label}
          rows={board.map((b) => ({
            rank: b.rank,
            company: b.player.companyName,
            email: b.email,
            mark: b.mark,
            business: b.business.raw,
            businessPct: b.business.pct,
            accuracy: b.accMax ? b.accScore / b.accMax : null,
            monthsDone: b.monthsDone,
            autoMonths: b.autoMonths,
            href: `/t/sim-runs/${id}/students/${b.player.studentId}`,
          }))}
        />
        {enrolled.length > board.length && <p className="hint">{enrolled.length - board.length} student(s) haven't started their company yet.</p>}
      </section>
    </div>
  );
}
