import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { companyResults, leaderboard, loadRun, monthRows, runState } from "@/lib/sim/data";
import { defaultDecisions, finalMark, initialState, monthExercise, monthLabel, businessScore } from "@/lib/sim/engine";
import { buildView } from "@/lib/spec/engine";
import { formatAmount } from "@/lib/spec/format";
import { PageTitle } from "@/components/ui/bits";
import { SubmitButton } from "@/components/ui/client";
import { EventCard, Leaderboard, MetricCharts, Stepper } from "@/components/sim/SimBits";
import { MonthReport } from "@/components/sim/MonthReport";
import { startCompany } from "@/app/actions/sim";
import { DecideClient, RecordClient } from "./GameClient";

const STEPS = ["Decide", "Event", "Record the books", "Results"];

export default async function GamePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const me = await requireStudent();
  const data = await loadRun(runId);
  if (!data) notFound();
  const { run, spec } = data;
  const db = await getDb();
  const [enrolled] = await db.select().from(schema.enrollments).where(and(eq(schema.enrollments.classId, run.classId), eq(schema.enrollments.studentId, me.id)));
  if (!enrolled) notFound();
  const [player] = await db.select().from(schema.simPlayers).where(and(eq(schema.simPlayers.runId, runId), eq(schema.simPlayers.studentId, me.id)));
  const st = runState(run, spec);

  if (!player) {
    if (st.ended) return <PageTitle title="This simulation has ended" />;
    return (
      <div className="stack">
        <PageTitle title={spec.title} sticker="New game" sub={spec.story} />
        <form action={startCompany.bind(null, runId)} className="card hero stack-sm" style={{ maxWidth: 560 }}>
          <label className="field">
            <span className="card-title">Name your company</span>
            <input className="input" name="companyName" required maxLength={40} placeholder={`e.g. ${spec.business.name}`} />
          </label>
          <p className="hint">Only this name shows on the class leaderboard.</p>
          <SubmitButton>Start my company</SubmitButton>
        </form>
      </div>
    );
  }

  const rows = await monthRows(player.id);
  const results = companyResults(spec, rows);
  const month = run.openedMonth;
  const row = rows.find((r) => r.month === month);
  const doneRows = rows.filter((r) => r.step === "done");
  const board = await leaderboard(run, spec);
  const mine = board.find((b) => b.player.id === player.id);
  const boardRows = board.map((b) => ({
    rank: b.rank,
    company: b.player.companyName,
    mark: b.mark,
    business: b.business.raw,
    businessPct: b.business.pct,
    accuracy: b.accMax ? b.accScore / b.accMax : null,
    monthsDone: b.monthsDone,
    autoMonths: b.autoMonths,
    me: b.player.id === player.id,
  }));
  const charts =
    doneRows.length > 0 ? (
      <MetricCharts
        labels={results.slice(0, doneRows.length).map((r) => r.label)}
        series={spec.metrics.map((m, i) => ({ label: m.label, kind: m.kind, values: results.slice(0, doneRows.length).map((r) => r.metrics[i]) }))}
      />
    ) : null;
  const opening = month === 1 ? initialState(spec) : (results[month - 2]?.closing ?? initialState(spec));

  const header = (
    <div className="row-between">
      <PageTitle title={player.companyName} sub={`${spec.title} · ${monthLabel(spec, month)} (${month} of ${spec.months})`} />
      {mine && (
        <div className="card ink small rise rise-2" style={{ minWidth: 200 }}>
          <p className="label muted">Your place</p>
          <p className="big-num" style={{ fontSize: 44 }}>
            #{mine.rank}
            <span style={{ fontSize: 20 }}> of {board.length}</span>
          </p>
        </div>
      )}
    </div>
  );

  if (st.ended) {
    const score = doneRows.length ? businessScore(spec, results.slice(0, doneRows.length)) : { raw: 0, pct: 0 };
    const acc = doneRows.reduce((s, r) => s + (r.accScore ?? 0), 0);
    const accMax = doneRows.reduce((s, r) => s + (r.accMax ?? 0), 0);
    return (
      <div className="stack">
        {header}
        <div className="grid-3">
          <div className="card ink">
            <p className="label muted">Final mark</p>
            <p className="big-num">{finalMark(acc, accMax, score.pct, run.accountingWeight).toFixed(1)}</p>
          </div>
          <div className="card">
            <p className="label">Books ({run.accountingWeight}%)</p>
            <p className="big-num" style={{ fontSize: 40 }}>{accMax ? Math.round((acc / accMax) * 100) : 0}%</p>
          </div>
          <div className="card">
            <p className="label">Business ({100 - run.accountingWeight}%)</p>
            <p className="big-num" style={{ fontSize: 40 }}>{Math.round(score.pct * 100)}%</p>
            <p className="hint">
              {spec.score.label}: {formatAmount(score.raw)}
            </p>
          </div>
        </div>
        {charts}
        <h2>Final leaderboard</h2>
        <Leaderboard rows={boardRows} scoreLabel={spec.score.label} />
      </div>
    );
  }

  const step = !row ? 0 : row.step === "record" ? 2 : 3;
  return (
    <div className="stack">
      {header}
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="grid-2" style={{ alignItems: "start" }}>
          <DecideClient runId={runId} decisions={spec.decisions} initial={(rows.find((r) => r.month === month - 1)?.decisions as Record<string, number>) ?? defaultDecisions(spec)} />
          <section className="card stack-sm">
            <h2>Your company at the start of {monthLabel(spec, month)}</h2>
            <table className="list">
              <tbody>
                {spec.state.map((s) => (
                  <tr key={s.name}>
                    <td>{s.label}</td>
                    <td className="num">{formatAmount(opening[s.name])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {month === 1 && <p className="hint">{spec.story}</p>}
          </section>
        </div>
      )}

      {step === 2 &&
        (() => {
          const r = results[month - 1];
          const ex = monthExercise(spec, r);
          const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
          return (
            <>
              {r.event && <EventCard title={r.event.title} text={r.event.text} />}
              <RecordClient key={`${player.id}-${month}`} runId={runId} draftId={`${player.id}-${month}`} view={buildView(ex, params)} />
            </>
          );
        })()}

      {step === 3 && row && results[month - 1] && (
        <>
          <MonthReport spec={spec} result={results[month - 1]} row={row} />
          <div className="card ink">
            <p className="card-title">{month < spec.months ? `Waiting for your doctor to open ${monthLabel(spec, month + 1)}.` : "That was the last month!"}</p>
            <p className="muted">Final results show here when the simulation ends ({new Date(run.deadline).toLocaleDateString("en-GB", { timeZone: "Asia/Muscat" })}).</p>
          </div>
        </>
      )}

      {charts}
      <section className="stack-sm">
        <h2>Leaderboard</h2>
        <Leaderboard rows={boardRows} scoreLabel={spec.score.label} />
      </section>
      {doneRows.filter((r) => r.month < month).length > 0 && (
        <section className="stack-sm">
          <h2>Earlier months</h2>
          {doneRows
            .filter((r) => r.month < month)
            .map((r) => (
              <details key={r.month} className="card">
                <summary className="card-title" style={{ cursor: "pointer" }}>
                  {results[r.month - 1]?.label}
                </summary>
                {results[r.month - 1] && <MonthReport spec={spec} result={results[r.month - 1]} row={r} />}
              </details>
            ))}
        </section>
      )}
    </div>
  );
}
