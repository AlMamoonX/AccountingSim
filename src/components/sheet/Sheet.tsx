"use client";

import type { ReactNode } from "react";
import type {
  ExerciseView,
  GridView,
  JournalView,
  NumericView,
  StudentAnswers,
  GridAnswers,
  JournalAnswers,
  NumericAnswers,
  JournalLineAnswer,
  Mark,
} from "@/lib/spec/engine";
import { formatAmount, parseAmount } from "@/lib/spec/format";
import { PartBadge } from "@/components/ui/bits";

export type PartExpected = {
  expected: Record<string, number>;
  expectedLines: Record<string, { account: string; side: "debit" | "credit"; amount: number }[]>;
};

export interface SheetProps {
  view: ExerciseView;
  answers: StudentAnswers;
  /** Leave out for a read-only sheet. */
  onChange?: (partId: string, value: GridAnswers | JournalAnswers | NumericAnswers) => void;
  marks?: Record<string, Record<string, Mark>>;
  /** Correct values; shown next to wrong or empty boxes. */
  expected?: Record<string, PartExpected>;
  partFooter?: (partId: string) => ReactNode;
  hideStory?: boolean;
}

export function Sheet({ view, answers, onChange, marks, expected, partFooter, hideStory }: SheetProps) {
  return (
    <div className="stack">
      {!hideStory && (
        <section className="card rise rise-2">
          <div className="stack-sm">
            <h2>{view.business.name}</h2>
            {view.period && <span className="badge b-yellow" style={{ alignSelf: "flex-start" }}>{view.period}</span>}
            {view.story && <p className="lead">{view.story}</p>}
            {view.transactions.length > 0 && (
              <ol className="transactions" aria-label="Transactions">
                {view.transactions.map((t) => (
                  <li key={t.id}>
                    <span>{t.n}</span>
                    <span>{t.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}
      {view.parts.map((p, i) => (
        <section key={p.id} className="card rise rise-3 part" aria-labelledby={`part-${p.id}`}>
          <div className="part-head">
            <PartBadge index={i} />
            <div>
              <h2 id={`part-${p.id}`}>{p.title}</h2>
              {p.instructions && <p className="muted">{p.instructions}</p>}
            </div>
          </div>
          {p.type === "grid" && (
            <GridSheet
              part={p}
              value={(answers[p.id] ?? {}) as GridAnswers}
              onChange={onChange && ((v) => onChange(p.id, v))}
              marks={marks?.[p.id]}
              expected={expected?.[p.id]}
            />
          )}
          {p.type === "journal" && (
            <JournalSheet
              part={p}
              value={(answers[p.id] ?? {}) as JournalAnswers}
              onChange={onChange && ((v) => onChange(p.id, v))}
              marks={marks?.[p.id]}
              expected={expected?.[p.id]}
            />
          )}
          {p.type === "numeric" && (
            <NumericSheet
              part={p}
              value={(answers[p.id] ?? {}) as NumericAnswers}
              onChange={onChange && ((v) => onChange(p.id, v))}
              marks={marks?.[p.id]}
              expected={expected?.[p.id]}
            />
          )}
          {partFooter?.(p.id)}
        </section>
      ))}
    </div>
  );
}

function Box({
  label,
  value,
  onChange,
  mark,
  correct,
  wide,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  mark?: Mark;
  correct?: number;
  wide?: boolean;
}) {
  const showCorrect = correct !== undefined && mark !== "right" && !(parseAmount(value) === null && Math.abs(correct) < 0.01);
  return (
    <span className={`box${mark ? ` ${mark}` : ""}${showCorrect && mark === "wrong" ? " struck" : ""}`} style={wide ? { minWidth: 140 } : undefined}>
      <input
        aria-label={label}
        size={6}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        readOnly={!onChange}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      {mark && (
        <span className={`mark ${mark}`} aria-label={mark === "right" ? "right" : "wrong"} role="img">
          {mark === "right" ? "✓" : "×"}
        </span>
      )}
      {showCorrect && <span className="correct">= {formatAmount(correct!)}</span>}
    </span>
  );
}

function GridSheet({
  part,
  value,
  onChange,
  marks,
  expected,
}: {
  part: GridView;
  value: GridAnswers;
  onChange?: (v: GridAnswers) => void;
  marks?: Record<string, Mark>;
  expected?: PartExpected;
}) {
  const setCell = (key: string, v: string) => onChange?.({ ...value, cells: { ...(value.cells ?? {}), [key]: v } });
  const setTotal = (col: string, v: string) => onChange?.({ ...value, totals: { ...(value.totals ?? {}), [col]: v } });
  return (
    <div className="sheet-scroll">
      <table className="sheet">
        <thead>
          {part.groups.length > 0 && (
            <tr>
              <th className="rowhead" />
              {part.groups.map((g, i) => (
                <th key={`${g.id}-${i}`} colSpan={g.span} className={g.id ? "group" : undefined} scope="colgroup">
                  {g.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            <th className="rowhead" scope="col">
              {part.rowHeader}
            </th>
            {part.columns.map((c) => (
              <th key={c.id} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {part.rows.map((r) => (
            <tr key={r.id} className={r.kind === "heading" ? "heading" : `kind-${r.kind}`}>
              <td className="rowhead">{r.label}</td>
              {part.columns.map((c) => {
                const cell = r.cells[c.id];
                if (!cell) return <td key={c.id} />;
                if ("given" in cell)
                  return (
                    <td key={c.id}>
                      <div className="given" aria-label={`${r.label}, ${c.label} (given)`}>
                        {formatAmount(cell.given)}
                      </div>
                    </td>
                  );
                const key = `${r.id}.${c.id}`;
                return (
                  <td key={c.id}>
                    <Box
                      label={`${r.label}, ${c.label}`}
                      value={value.cells?.[key] ?? ""}
                      onChange={onChange && ((v) => setCell(key, v))}
                      mark={marks?.[key]}
                      correct={expected?.expected[key]}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
          {part.totals && (
            <tr className="totals">
              <td className="rowhead">{part.totalsLabel}</td>
              {part.columns.map((c) => (
                <td key={c.id}>
                  <Box
                    label={`${part.totalsLabel}, ${c.label}`}
                    value={value.totals?.[c.id] ?? ""}
                    onChange={onChange && ((v) => setTotal(c.id, v))}
                    mark={marks?.[`total.${c.id}`]}
                    correct={expected?.expected[`total.${c.id}`]}
                  />
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const EMPTY_LINE: JournalLineAnswer = { account: "", debit: "", credit: "" };

function JournalSheet({
  part,
  value,
  onChange,
  marks,
  expected,
}: {
  part: JournalView;
  value: JournalAnswers;
  onChange?: (v: JournalAnswers) => void;
  marks?: Record<string, Mark>;
  expected?: PartExpected;
}) {
  const accountLabel = (id: string) => part.accounts.find((a) => a.id === id)?.label ?? id;
  return (
    <div className="stack-sm">
      {part.entries.map((e) => {
        const lines = value.entries?.[e.id]?.length ? value.entries[e.id] : [EMPTY_LINE, EMPTY_LINE];
        const setLines = (next: JournalLineAnswer[]) => onChange?.({ entries: { ...(value.entries ?? {}), [e.id]: next } });
        const dr = lines.reduce((s, l) => s + (parseAmount(l.debit) || 0), 0);
        const cr = lines.reduce((s, l) => s + (parseAmount(l.credit) || 0), 0);
        const balanced = Math.abs(dr - cr) < 0.01;
        const exp = expected?.expectedLines[e.id];
        return (
          <div className="journal-entry" key={e.id}>
            <div className="row-between">
              <strong>
                <span className="mono">{e.label}</span> · {e.description}
              </strong>
              {marks?.[e.id] && (
                <span className={`badge ${marks[e.id] === "right" ? "b-blue" : "b-orange"}`}>
                  {marks[e.id] === "right" ? "✓ Entry right" : "× Entry not right"}
                </span>
              )}
            </div>
            <div className="jline jhead" aria-hidden>
              <span>Account</span>
              <span style={{ textAlign: "right" }}>Debit</span>
              <span style={{ textAlign: "right" }}>Credit</span>
              <span />
            </div>
            {lines.map((l, idx) => {
              const mark = marks?.[`${e.id}.${idx}`];
              const update = (patch: Partial<JournalLineAnswer>) => setLines(lines.map((x, j) => (j === idx ? { ...x, ...patch } : x)));
              return (
                <div className="jline" key={idx}>
                  <select
                    className="select"
                    aria-label={`Entry ${e.label}, line ${idx + 1}, account`}
                    value={l.account}
                    disabled={!onChange}
                    onChange={(ev) => update({ account: ev.target.value })}
                  >
                    <option value="">Choose account…</option>
                    {part.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <Box label={`Entry ${e.label}, line ${idx + 1}, debit`} value={l.debit} onChange={onChange && ((v) => update({ debit: v }))} mark={mark} />
                  <Box label={`Entry ${e.label}, line ${idx + 1}, credit`} value={l.credit} onChange={onChange && ((v) => update({ credit: v }))} mark={mark} />
                  {onChange ? (
                    <button
                      type="button"
                      className="btn-text danger"
                      aria-label={`Remove line ${idx + 1}`}
                      onClick={() => setLines(lines.filter((_, j) => j !== idx))}
                      disabled={lines.length <= 1}
                    >
                      ×
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
            <div className="row-between">
              {onChange ? (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setLines([...lines, EMPTY_LINE])}>
                  + Add line
                </button>
              ) : (
                <span />
              )}
              {(dr !== 0 || cr !== 0) && (
                <span className={`badge ${balanced ? "b-teal" : "b-yellow"}`}>
                  {balanced ? "Debits = Credits" : `Debits ${formatAmount(dr)} · Credits ${formatAmount(cr)}`}
                </span>
              )}
            </div>
            {exp && marks?.[e.id] !== "right" && (
              <div className="alert info">
                Correct entry:{" "}
                {exp.map((x, i) => (
                  <span key={i} className="mono" style={{ display: "block", paddingLeft: x.side === "credit" ? 24 : 0 }}>
                    {x.side === "debit" ? "Dr" : "Cr"} {accountLabel(x.account)} {formatAmount(x.amount)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumericSheet({
  part,
  value,
  onChange,
  marks,
  expected,
}: {
  part: NumericView;
  value: NumericAnswers;
  onChange?: (v: NumericAnswers) => void;
  marks?: Record<string, Mark>;
  expected?: PartExpected;
}) {
  return (
    <div className="stack-sm">
      {part.questions.map((q) => (
        <label className="question" key={q.id}>
          <span style={{ fontWeight: 700 }}>
            {q.prompt} {q.unit && <span className="muted">({q.unit})</span>}
          </span>
          <Box
            wide
            label={q.prompt}
            value={value.values?.[q.id] ?? ""}
            onChange={onChange && ((v) => onChange({ values: { ...(value.values ?? {}), [q.id]: v } }))}
            mark={marks?.[q.id]}
            correct={expected?.expected[q.id]}
          />
        </label>
      ))}
    </div>
  );
}
