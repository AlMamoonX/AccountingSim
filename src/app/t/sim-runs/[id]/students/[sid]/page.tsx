import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isUuid } from "@/lib/data";
import { companyResults, loadRun, monthRows } from "@/lib/sim/data";
import { businessScore } from "@/lib/sim/engine";
import { formatAmount } from "@/lib/spec/format";
import { PageTitle } from "@/components/ui/bits";
import { MetricCharts } from "@/components/sim/SimBits";
import { MonthReport } from "@/components/sim/MonthReport";

export default async function SimStudentPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const data = await loadRun(id);
  if (!data || !isUuid(sid)) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ player: schema.simPlayers, email: schema.users.email })
    .from(schema.simPlayers)
    .innerJoin(schema.users, eq(schema.users.id, schema.simPlayers.studentId))
    .where(and(eq(schema.simPlayers.runId, id), eq(schema.simPlayers.studentId, sid)));
  if (!row) notFound();
  const rows = await monthRows(row.player.id);
  const results = companyResults(data.spec, rows);
  const done = rows.filter((r) => r.step === "done");
  const score = done.length ? businessScore(data.spec, results.slice(0, done.length)) : null;
  return (
    <div className="stack">
      <PageTitle title={row.player.companyName} sub={`${row.email} · ${data.spec.title}`} />
      {score && (
        <p className="card ink">
          Business so far: <span className="mono">{formatAmount(score.raw)}</span> ({Math.round(score.pct * 100)}%)
        </p>
      )}
      {results.length > 0 && (
        <MetricCharts labels={results.map((r) => r.label)} series={data.spec.metrics.map((m, i) => ({ label: m.label, kind: m.kind, values: results.map((r) => r.metrics[i]) }))} />
      )}
      {rows.length === 0 && <p className="card small muted">No months played yet.</p>}
      {rows.map((r) => (
        <details key={r.month} className="card" open={r.month === rows.length}>
          <summary className="card-title" style={{ cursor: "pointer" }}>
            {results[r.month - 1]?.label} {r.step === "record" && <span className="badge b-yellow">recording</span>}
          </summary>
          {results[r.month - 1] && <MonthReport spec={data.spec} result={results[r.month - 1]} row={r} />}
        </details>
      ))}
    </div>
  );
}
