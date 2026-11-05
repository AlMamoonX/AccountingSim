"use client";

import { useMemo, useState } from "react";
import { ExerciseSpecSchema, type ExerciseSpec, type GridPart, type JournalPart, type NumericPart, type Part } from "@/lib/spec/schema";
import { Model, defaultParams } from "@/lib/spec/engine";
import { formatAmount } from "@/lib/spec/format";
import { PartBadge } from "@/components/ui/bits";

type Up = (fn: (s: ExerciseSpec) => void) => void;

/** Structured editor. With onChange undefined it is read-only (published exercise). */
export function SpecEditor({ spec, onChange }: { spec: ExerciseSpec; onChange?: (s: ExerciseSpec) => void }) {
  const ro = !onChange;
  const up: Up = (fn) => {
    if (!onChange) return;
    const next = structuredClone(spec);
    fn(next);
    onChange(next);
  };
  const model = useMemo(() => {
    try {
      return new Model(spec, defaultParams(spec));
    } catch {
      return null;
    }
  }, [spec]);
  const val = (name: string) => {
    try {
      return model ? formatAmount(model.value(name)) : "?";
    } catch (e) {
      return `⚠ ${(e as Error).message}`;
    }
  };

  return (
    <fieldset disabled={ro} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      {ro && <p className="alert info">Published exercises are locked. Make a copy to change it.</p>}
      <section className="card stack-sm">
        <h2>Business and story</h2>
        <div className="grid-2">
          <Text label="Exercise title" value={spec.title} onChange={(v) => up((s) => void (s.title = v))} />
          <Text label="Business name" value={spec.business.name} onChange={(v) => up((s) => void (s.business.name = v))} />
          <Text label="Currency" value={spec.currency} onChange={(v) => up((s) => void (s.currency = v))} />
          <Text label="Period" value={spec.period ?? ""} onChange={(v) => up((s) => void (s.period = v || undefined))} />
        </div>
        <Area label="Story (use {{amountName}} to show an amount)" value={spec.story} onChange={(v) => up((s) => void (s.story = v))} />
      </section>

      <section className="card stack-sm">
        <h2>Amounts</h2>
        <p className="hint">Every answer is calculated from these. Min, max and step are used when each student gets different numbers.</p>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Name (used in formulas)</th>
                <th>Label</th>
                <th className="num">Value</th>
                <th className="num">Min</th>
                <th className="num">Max</th>
                <th className="num">Step</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {spec.params.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input className="input mono" aria-label="Name" value={p.name} onChange={(e) => up((s) => void (s.params[i].name = e.target.value))} />
                  </td>
                  <td>
                    <input className="input" aria-label="Label" value={p.label ?? ""} onChange={(e) => up((s) => void (s.params[i].label = e.target.value))} />
                  </td>
                  {(["value", "min", "max", "step"] as const).map((k) => (
                    <td key={k}>
                      <input
                        className="input num"
                        aria-label={k}
                        type="number"
                        value={p[k] ?? ""}
                        onChange={(e) =>
                          up((s) => {
                            const n = e.target.value === "" ? undefined : Number(e.target.value);
                            if (k === "value") s.params[i].value = n ?? 0;
                            else s.params[i][k] = n;
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <Remove onClick={() => up((s) => void s.params.splice(i, 1))} label={`Remove ${p.name}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Add onClick={() => up((s) => void s.params.push({ name: `amount${s.params.length + 1}`, label: "", value: 100 }))}>+ Add amount</Add>
      </section>

      <section className="card stack-sm">
        <h2>Transactions</h2>
        {spec.transactions.map((t, i) => (
          <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
            <span className="mono" style={{ width: 28 }}>
              {i + 1}
            </span>
            <input className="input" aria-label={`Transaction ${i + 1}`} value={t.text} onChange={(e) => up((s) => void (s.transactions[i].text = e.target.value))} />
            <Move i={i} n={spec.transactions.length} onMove={(a, b) => up((s) => swap(s.transactions, a, b))} />
            <Remove onClick={() => up((s) => void s.transactions.splice(i, 1))} label={`Remove transaction ${i + 1}`} />
          </div>
        ))}
        <Add onClick={() => up((s) => void s.transactions.push({ id: freeId("t", s.transactions.map((x) => x.id)), text: "" }))}>+ Add transaction</Add>
      </section>

      {spec.parts.map((part, pi) => (
        <section key={pi} className="card stack-sm">
          <div className="part-head">
            <PartBadge index={pi} />
            <div className="stack-sm" style={{ flex: 1 }}>
              <div className="row">
                <span className="badge b-purple">{part.type === "grid" ? "Fill-in table" : part.type === "journal" ? "Journal entries" : "Number questions"}</span>
                <span className="hint">
                  id <span className="mono">{part.id}</span>
                </span>
                <span className="spacer" />
                <Move i={pi} n={spec.parts.length} onMove={(a, b) => up((s) => swap(s.parts, a, b))} />
                <Remove onClick={() => up((s) => void s.parts.splice(pi, 1))} label={`Remove part ${pi + 1}`} text="Remove part" />
              </div>
              <Text label="Title" value={part.title} onChange={(v) => up((s) => void (s.parts[pi].title = v))} />
              <Text label="Instructions" value={part.instructions ?? ""} onChange={(v) => up((s) => void (s.parts[pi].instructions = v || undefined))} />
            </div>
          </div>
          {part.type === "grid" && <GridEditor part={part} pi={pi} up={up} val={val} />}
          {part.type === "journal" && <JournalEditor part={part} pi={pi} up={up} val={val} />}
          {part.type === "numeric" && <NumericEditor part={part} pi={pi} up={up} val={val} />}
          <Checks checks={part.checks} onChange={(fn) => up((s) => fn(s.parts[pi].checks))} />
        </section>
      ))}

      {!ro && (
        <div className="row">
          <span className="label">Add a part:</span>
          <Add onClick={() => up((s) => void s.parts.push(newPart("grid", s.parts)))}>+ Fill-in table</Add>
          <Add onClick={() => up((s) => void s.parts.push(newPart("journal", s.parts)))}>+ Journal entries</Add>
          <Add onClick={() => up((s) => void s.parts.push(newPart("numeric", s.parts)))}>+ Number questions</Add>
        </div>
      )}

      <section className="card stack-sm">
        <h2>Exercise-wide checks</h2>
        <Checks checks={spec.checks} onChange={(fn) => up((s) => fn(s.checks))} />
        <Area label="Notes for you (not shown to students)" value={spec.teacherNotes ?? ""} onChange={(v) => up((s) => void (s.teacherNotes = v || undefined))} />
      </section>

      <FormulaHelp />
      {!ro && <JsonEditor spec={spec} onApply={onChange!} />}
    </fieldset>
  );
}

/* ---------------- part editors ---------------- */

function GridEditor({ part, pi, up, val }: { part: GridPart; pi: number; up: Up; val: (n: string) => string }) {
  const g = (s: ExerciseSpec) => s.parts[pi] as GridPart;
  return (
    <div className="stack-sm">
      <h3>Column groups</h3>
      <div className="row">
        {part.groups.map((gr, gi) => (
          <span key={gi} className="row" style={{ background: "var(--field)", borderRadius: 18, padding: 6 }}>
            <input className="input mono" style={{ width: 110 }} aria-label="Group id" value={gr.id} onChange={(e) => up((s) => void (g(s).groups[gi].id = e.target.value))} />
            <input className="input" style={{ width: 150 }} aria-label="Group label" value={gr.label} onChange={(e) => up((s) => void (g(s).groups[gi].label = e.target.value))} />
            <Remove onClick={() => up((s) => void g(s).groups.splice(gi, 1))} label="Remove group" />
          </span>
        ))}
        <Add onClick={() => up((s) => void g(s).groups.push({ id: freeId("group", g(s).groups.map((x) => x.id)), label: "Group" }))}>+ Group</Add>
      </div>
      <h3>Columns</h3>
      <div className="row">
        {part.columns.map((c, ci) => (
          <span key={ci} className="row" style={{ background: "var(--field)", borderRadius: 18, padding: 6 }}>
            <input className="input mono" style={{ width: 100 }} aria-label="Column id" value={c.id} onChange={(e) => up((s) => renameColumn(g(s), ci, e.target.value))} />
            <input className="input" style={{ width: 160 }} aria-label="Column label" value={c.label} onChange={(e) => up((s) => void (g(s).columns[ci].label = e.target.value))} />
            {part.groups.length > 0 && (
              <select className="select" style={{ width: 130 }} aria-label="Group" value={c.group ?? ""} onChange={(e) => up((s) => void (g(s).columns[ci].group = e.target.value || undefined))}>
                <option value="">No group</option>
                {part.groups.map((gr) => (
                  <option key={gr.id} value={gr.id}>
                    {gr.label}
                  </option>
                ))}
              </select>
            )}
            <Remove onClick={() => up((s) => void g(s).columns.splice(ci, 1))} label={`Remove column ${c.label}`} />
          </span>
        ))}
        <Add onClick={() => up((s) => void g(s).columns.push({ id: freeId("col", g(s).columns.map((x) => x.id)), label: "New column" }))}>+ Column</Add>
      </div>
      <h3>Rows and answers</h3>
      <p className="hint">
        Type a formula in a box (e.g. <span className="mono">-rent</span>). Empty = no effect. Tick “shown” to give the number to students instead of asking for it.
      </p>
      <div className="sheet-scroll">
        <table className="sheet">
          <thead>
            <tr>
              <th className="rowhead">Row</th>
              {part.columns.map((c) => (
                <th key={c.id}>{c.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {part.rows.map((r, ri) => (
              <tr key={ri}>
                <td className="rowhead">
                  <div className="stack-sm" style={{ gap: 4 }}>
                    <input className="input" aria-label="Row label" value={r.label} onChange={(e) => up((s) => void (g(s).rows[ri].label = e.target.value))} />
                    <div className="row" style={{ gap: 6 }}>
                      <input className="input mono" style={{ width: 80, minHeight: 40 }} aria-label="Row id" value={r.id} onChange={(e) => up((s) => void (g(s).rows[ri].id = e.target.value))} />
                      <select className="select" style={{ width: 110, minHeight: 40 }} aria-label="Row kind" value={r.kind} onChange={(e) => up((s) => void (g(s).rows[ri].kind = e.target.value as "entry"))}>
                        <option value="entry">Entry</option>
                        <option value="total">Subtotal</option>
                        <option value="heading">Heading</option>
                      </select>
                    </div>
                  </div>
                </td>
                {part.columns.map((c) => {
                  if (r.kind === "heading") return <td key={c.id} />;
                  const cell = r.cells[c.id];
                  const text = cell ? ("answer" in cell ? cell.answer : cell.given) : "";
                  const given = !!cell && "given" in cell;
                  return (
                    <td key={c.id} style={{ verticalAlign: "top" }}>
                      <input
                        className="input mono"
                        style={{ minWidth: 120 }}
                        aria-label={`${r.label}, ${c.label} formula`}
                        value={text}
                        onChange={(e) =>
                          up((s) => {
                            const cells = g(s).rows[ri].cells;
                            const v = e.target.value;
                            if (!v.trim()) delete cells[c.id];
                            else cells[c.id] = given ? { given: v } : { answer: v };
                          })
                        }
                      />
                      {cell && (
                        <div className="row-between" style={{ gap: 4 }}>
                          <label className="hint" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={given}
                              onChange={(e) =>
                                up((s) => {
                                  g(s).rows[ri].cells[c.id] = e.target.checked ? { given: text } : { answer: text };
                                })
                              }
                            />
                            shown
                          </label>
                          <span className="mono hint">= {val(`${part.id}.${r.id}.${c.id}`)}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td>
                  <div className="row" style={{ flexWrap: "nowrap", gap: 0 }}>
                    <Move i={ri} n={part.rows.length} onMove={(a, b) => up((s) => swap(g(s).rows, a, b))} />
                    <Remove onClick={() => up((s) => void g(s).rows.splice(ri, 1))} label={`Remove row ${r.label}`} />
                  </div>
                </td>
              </tr>
            ))}
            <tr className="totals">
              <td className="rowhead">
                <label className="check-row">
                  <input type="checkbox" checked={part.totals} onChange={(e) => up((s) => void (g(s).totals = e.target.checked))} /> Students fill a totals row
                </label>
                {part.totals && (
                  <input className="input" aria-label="Totals row label" value={part.totalsLabel ?? ""} placeholder="Totals" onChange={(e) => up((s) => void (g(s).totalsLabel = e.target.value || undefined))} />
                )}
              </td>
              {part.columns.map((c) => (
                <td key={c.id} className="mono" style={{ textAlign: "right" }}>
                  {val(`${part.id}.total.${c.id}`)}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <Add onClick={() => up((s) => void g(s).rows.push({ id: freeId("r", g(s).rows.map((x) => x.id)), label: "New row", kind: "entry", cells: {} }))}>+ Row</Add>
      {part.groups.length > 0 && (
        <p className="hint">
          Group totals:{" "}
          {part.groups.map((gr) => (
            <span key={gr.id} className="mono" style={{ marginRight: 14 }}>
              {gr.label} {val(`${part.id}.group.${gr.id}`)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function JournalEditor({ part, pi, up, val }: { part: JournalPart; pi: number; up: Up; val: (n: string) => string }) {
  const j = (s: ExerciseSpec) => s.parts[pi] as JournalPart;
  return (
    <div className="stack-sm">
      <h3>Accounts students can choose</h3>
      <div className="row">
        {part.accounts.map((a, ai) => (
          <span key={ai} className="row" style={{ background: "var(--field)", borderRadius: 18, padding: 6 }}>
            <input className="input mono" style={{ width: 110 }} aria-label="Account id" value={a.id} onChange={(e) => up((s) => void (j(s).accounts[ai].id = e.target.value))} />
            <input className="input" style={{ width: 180 }} aria-label="Account name" value={a.label} onChange={(e) => up((s) => void (j(s).accounts[ai].label = e.target.value))} />
            <Remove onClick={() => up((s) => void j(s).accounts.splice(ai, 1))} label={`Remove ${a.label}`} />
          </span>
        ))}
        <Add onClick={() => up((s) => void j(s).accounts.push({ id: freeId("acc", j(s).accounts.map((x) => x.id)), label: "New account" }))}>+ Account</Add>
      </div>
      <h3>Entries</h3>
      {part.entries.map((e, ei) => (
        <div key={ei} className="journal-entry">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input mono" style={{ width: 70 }} aria-label="Entry label" value={e.label ?? ""} onChange={(ev) => up((s) => void (j(s).entries[ei].label = ev.target.value || undefined))} />
            <input className="input" aria-label="Entry description" value={e.description} onChange={(ev) => up((s) => void (j(s).entries[ei].description = ev.target.value))} />
            <Remove onClick={() => up((s) => void j(s).entries.splice(ei, 1))} label="Remove entry" />
          </div>
          {e.lines.map((l, li) => {
            const side = l.debit !== undefined ? "debit" : "credit";
            const f = (l.debit ?? l.credit)!;
            return (
              <div key={li} className="row" style={{ flexWrap: "nowrap" }}>
                <select className="select" aria-label="Account" value={l.account} onChange={(ev) => up((s) => void (j(s).entries[ei].lines[li].account = ev.target.value))}>
                  {part.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  style={{ width: 120 }}
                  aria-label="Debit or credit"
                  value={side}
                  onChange={(ev) => up((s) => void (j(s).entries[ei].lines[li] = { account: l.account, [ev.target.value]: f }))}
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
                <input
                  className="input mono"
                  aria-label="Amount formula"
                  value={f}
                  onChange={(ev) => up((s) => void (j(s).entries[ei].lines[li] = { account: l.account, [side]: ev.target.value }))}
                />
                <span className="mono hint" style={{ minWidth: 80, textAlign: "right" }}>
                  = {val(`${part.id}.${e.id}.line${li + 1}`)}
                </span>
                <Remove onClick={() => up((s) => void j(s).entries[ei].lines.splice(li, 1))} label="Remove line" />
              </div>
            );
          })}
          <Add onClick={() => up((s) => void j(s).entries[ei].lines.push({ account: part.accounts[0]?.id ?? "", debit: "0" }))}>+ Line</Add>
        </div>
      ))}
      <Add
        onClick={() =>
          up((s) =>
            void j(s).entries.push({
              id: freeId("e", j(s).entries.map((x) => x.id)),
              description: "",
              lines: [
                { account: part.accounts[0]?.id ?? "", debit: "0" },
                { account: part.accounts[1]?.id ?? "", credit: "0" },
              ],
            }),
          )
        }
      >
        + Entry
      </Add>
    </div>
  );
}

function NumericEditor({ part, pi, up, val }: { part: NumericPart; pi: number; up: Up; val: (n: string) => string }) {
  const n = (s: ExerciseSpec) => s.parts[pi] as NumericPart;
  return (
    <div className="stack-sm">
      {part.questions.map((q, qi) => (
        <div key={qi} className="journal-entry">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input" aria-label="Question" value={q.prompt} onChange={(e) => up((s) => void (n(s).questions[qi].prompt = e.target.value))} />
            <Remove onClick={() => up((s) => void n(s).questions.splice(qi, 1))} label="Remove question" />
          </div>
          <div className="row">
            <label className="field" style={{ flex: "2 1 200px" }}>
              <span className="label">Answer formula</span>
              <input className="input mono" value={q.answer} onChange={(e) => up((s) => void (n(s).questions[qi].answer = e.target.value))} />
            </label>
            <label className="field" style={{ flex: "1 1 90px" }}>
              <span className="label">Unit</span>
              <input className="input" value={q.unit ?? ""} onChange={(e) => up((s) => void (n(s).questions[qi].unit = e.target.value || undefined))} />
            </label>
            <label className="field" style={{ flex: "1 1 90px" }}>
              <span className="label">Allowed difference</span>
              <input
                className="input num"
                type="number"
                min={0}
                value={q.tolerance ?? ""}
                onChange={(e) => up((s) => void (n(s).questions[qi].tolerance = e.target.value === "" ? undefined : Number(e.target.value)))}
              />
            </label>
            <span className="mono" style={{ alignSelf: "flex-end", paddingBottom: 14 }}>
              = {val(`${part.id}.${q.id}`)}
            </span>
          </div>
        </div>
      ))}
      <Add onClick={() => up((s) => void n(s).questions.push({ id: freeId("q", n(s).questions.map((x) => x.id)), prompt: "New question", answer: "0" }))}>+ Question</Add>
    </div>
  );
}

/* ---------------- small pieces ---------------- */

function Checks({ checks, onChange }: { checks: { label: string; expr: string }[]; onChange: (fn: (c: { label: string; expr: string }[]) => void) => void }) {
  return (
    <div className="stack-sm">
      <h3>Checks (must always be true)</h3>
      {checks.map((c, i) => (
        <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" aria-label="Check name" value={c.label} onChange={(e) => onChange((cs) => void (cs[i].label = e.target.value))} />
          <input className="input mono" aria-label="Check formula" value={c.expr} onChange={(e) => onChange((cs) => void (cs[i].expr = e.target.value))} />
          <Remove onClick={() => onChange((cs) => void cs.splice(i, 1))} label="Remove check" />
        </div>
      ))}
      <Add onClick={() => onChange((cs) => void cs.push({ label: "New check", expr: "1 == 1" }))}>+ Check</Add>
    </div>
  );
}

function FormulaHelp() {
  return (
    <details className="card small">
      <summary className="btn-text" style={{ display: "inline-flex" }}>
        How formulas work
      </summary>
      <div className="stack-sm" style={{ marginTop: 10 }}>
        <p>
          Use amount names and <span className="mono">+ - * / ( )</span>. Functions: <span className="mono">sum() min() max() abs() round(x, 2) if(test, a, b)</span>.
        </p>
        <p>
          Other values: table box <span className="mono">A.r2.cash</span>, column total <span className="mono">A.total.cash</span>, group total{" "}
          <span className="mono">A.group.assets</span>, journal <span className="mono">B.debit.cash</span> / <span className="mono">B.credit.cash</span> /{" "}
          <span className="mono">B.balance.cash</span>, question <span className="mono">C.netIncome</span>. Inside a part you can leave out its letter.
        </p>
        <p>
          Checks use <span className="mono">== != &lt; &lt;= &gt; &gt;= &amp;&amp; ||</span>, e.g. <span className="mono">group.assets == group.liabilities + group.equity</span>.
        </p>
      </div>
    </details>
  );
}

function JsonEditor({ spec, onApply }: { spec: ExerciseSpec; onApply: (s: ExerciseSpec) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <details className="card small">
      <summary className="btn-text" style={{ display: "inline-flex" }} onClick={() => setText(JSON.stringify(spec, null, 2))}>
        Advanced: edit everything as JSON
      </summary>
      <div className="stack-sm" style={{ marginTop: 10 }}>
        <textarea className="textarea mono" style={{ minHeight: 360, fontSize: 13 }} value={text} onChange={(e) => setText(e.target.value)} aria-label="Exercise JSON" />
        {err && <p className="alert warn">{err}</p>}
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              try {
                const r = ExerciseSpecSchema.safeParse(JSON.parse(text));
                if (!r.success) return setErr(r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
                setErr(null);
                onApply(r.data);
              } catch {
                setErr("That isn't valid JSON.");
              }
            }}
          >
            Apply JSON
          </button>
        </div>
      </div>
    </details>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <textarea className="textarea" style={{ minHeight: 90 }} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Add({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="btn btn-secondary btn-small" onClick={onClick} style={{ alignSelf: "flex-start" }}>
      {children}
    </button>
  );
}
function Remove({ onClick, label, text = "×" }: { onClick: () => void; label: string; text?: string }) {
  return (
    <button type="button" className="btn-text danger" onClick={onClick} aria-label={label}>
      {text}
    </button>
  );
}
function Move({ i, n, onMove }: { i: number; n: number; onMove: (a: number, b: number) => void }) {
  return (
    <>
      <button type="button" className="btn-text" aria-label="Move up" disabled={i === 0} onClick={() => onMove(i, i - 1)}>
        ↑
      </button>
      <button type="button" className="btn-text" aria-label="Move down" disabled={i === n - 1} onClick={() => onMove(i, i + 1)}>
        ↓
      </button>
    </>
  );
}

function swap<T>(arr: T[], a: number, b: number) {
  [arr[a], arr[b]] = [arr[b], arr[a]];
}
function freeId(prefix: string, used: string[]) {
  let i = used.length + 1;
  while (used.includes(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}
function renameColumn(part: GridPart, ci: number, next: string) {
  const old = part.columns[ci].id;
  part.columns[ci].id = next;
  for (const r of part.rows) {
    if (r.cells[old]) {
      r.cells[next] = r.cells[old];
      delete r.cells[old];
    }
  }
}
function newPart(type: Part["type"], parts: Part[]): Part {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const id = letters.split("").find((l) => !parts.some((p) => p.id === l)) ?? `P${parts.length + 1}`;
  if (type === "grid")
    return { id, type, title: "New table", groups: [], columns: [{ id: "amount", label: "Amount" }], rows: [{ id: "r1", label: "Line 1", kind: "entry", cells: {} }], totals: false, checks: [] };
  if (type === "journal")
    return {
      id,
      type,
      title: "Journal entries",
      accounts: [
        { id: "cash", label: "Cash" },
        { id: "revenue", label: "Revenue" },
      ],
      entries: [{ id: "e1", description: "", lines: [{ account: "cash", debit: "0" }, { account: "revenue", credit: "0" }] }],
      checks: [],
    };
  return { id, type: "numeric", title: "Questions", questions: [{ id: "q1", prompt: "New question", answer: "0" }], checks: [] };
}
