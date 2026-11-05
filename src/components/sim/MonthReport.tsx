import type { SimMonthRow } from "@/db/schema";
import type { SimSpec } from "@/lib/sim/schema";
import { monthExercise, statementsView, type MonthResult } from "@/lib/sim/engine";
import { buildView, grade, type StudentAnswers } from "@/lib/spec/engine";
import { formatAmount } from "@/lib/spec/format";
import { ResultSheet } from "@/components/sheet/ResultSheet";
import { Sheet } from "@/components/sheet/Sheet";
import { EventCard } from "./SimBits";

/** One finished month: decisions, event, feedback, the marked books (with corrections) and the real statements. */
export function MonthReport({ spec, result, row, showBooks = true }: { spec: SimSpec; result: MonthResult; row: SimMonthRow; showBooks?: boolean }) {
  const ex = monthExercise(spec, result);
  const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
  const g = grade(ex, params, (row.answers ?? {}) as StudentAnswers);
  const sv = statementsView(spec, result);
  return (
    <div className="stack">
      <div className="grid-2">
        <section className="card stack-sm">
          <h3>Decisions</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {spec.decisions.map((d) => (
              <li key={d.name}>
                {d.label}:{" "}
                <strong className="mono">
                  {d.kind === "toggle" ? (result.decisions[d.name] ? "Yes" : "No") : d.kind === "choice" ? (d.options!.find((o) => o.value === result.decisions[d.name])?.label ?? "") : formatAmount(result.decisions[d.name])}
                </strong>
              </li>
            ))}
          </ul>
          {row.auto && <p className="badge b-orange">Auto-played: books not handed in, 0 accounting marks</p>}
          <p className="label">
            Books:{" "}
            <span className="mono">
              {row.accScore ?? 0}/{row.accMax ?? g.max}
            </span>
          </p>
        </section>
        <div className="stack-sm">
          {result.event && <EventCard title={result.event.title} text={result.event.text} />}
          {result.feedback.length > 0 && (
            <div className="alert info">
              <ul style={{ margin: 0 }}>
                {result.feedback.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {showBooks && !row.auto && (
        <>
          <h3>Your books, marked</h3>
          <ResultSheet view={buildView(ex, params)} answers={(row.answers ?? {}) as StudentAnswers} result={g} />
        </>
      )}
      {sv && (
        <>
          <h3>The real statements for {result.label}</h3>
          <Sheet view={sv} answers={{}} hideStory />
        </>
      )}
    </div>
  );
}
