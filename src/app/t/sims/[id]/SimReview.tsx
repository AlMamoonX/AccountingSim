"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SimSpecSchema, type SimSpec } from "@/lib/sim/schema";
import { analyzeSim, businessScore, defaultDecisions, monthExercise, runCompany, statementsView } from "@/lib/sim/engine";
import { withMonthWork } from "@/lib/sim/work";
import { buildView, perfectAnswers, type Values } from "@/lib/spec/engine";
import { formatAmount } from "@/lib/spec/format";
import type { ExerciseSpec } from "@/lib/spec/schema";
import { Sheet } from "@/components/sheet/Sheet";
import { Badge, PageTitle, fmtDate } from "@/components/ui/bits";
import { ConfirmButton, Tabs, Toast } from "@/components/ui/client";
import { DecisionControls } from "@/components/sim/DecisionForm";
import { EventCard, MetricCharts } from "@/components/sim/SimBits";
import { copySim, publishSim, restoreSimVersion, reviseSimAction, saveSim } from "@/app/actions/sim";
import { SpecEditor } from "@/app/t/exercises/[id]/SpecEditor";

type Tab = "overview" | "play" | "edit";

export function SimReview({
  id,
  status,
  spec: initial,
  sources,
  versions,
}: {
  id: string;
  status: "draft" | "published";
  spec: SimSpec;
  sources: { title: string; lecture: string | null; pageNo: number }[];
  versions: { id: number; note: string; createdAt: string }[];
}) {
  const router = useRouter();
  const locked = status === "published";
  const [spec, setSpec] = useState(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const initialJson = JSON.stringify(initial);
  const [lastInitial, setLastInitial] = useState(initialJson);
  if (initialJson !== lastInitial) {
    setLastInitial(initialJson);
    setSpec(initial);
    setBaseline(initialJson);
  }
  const dirty = JSON.stringify(spec) !== baseline;
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<null | "save" | "publish" | "revise">(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const analysis = useMemo(() => analyzeSim(spec, 12), [spec]);
  const notices = [...analysis.errors, ...analysis.failed.map((f) => `Check failed: ${f}`), ...spec.outOfCourse.map((o) => `Not from your slides: ${o}`)];

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };
  async function save() {
    setBusy("save");
    setError(null);
    const r = await saveSim(id, JSON.stringify(spec));
    setBusy(null);
    if (r.ok) {
      setBaseline(JSON.stringify(spec));
      flash("Saved");
      router.refresh();
    } else setError(r.error);
  }
  async function publish() {
    if (dirty) {
      const r = await saveSim(id, JSON.stringify(spec));
      if (!r.ok) return setError(r.error);
    }
    setBusy("publish");
    const r = await publishSim(id);
    setBusy(null);
    if (r.ok) router.refresh();
    else setError(r.error);
  }
  async function revise() {
    if (dirty) {
      const s = await saveSim(id, JSON.stringify(spec), "Edited before AI change");
      if (!s.ok) return setError(s.error);
    }
    setBusy("revise");
    setError(null);
    const r = await reviseSimAction(id, instruction);
    setBusy(null);
    if (r.ok) {
      setInstruction("");
      flash("The AI changed it");
      router.refresh();
    } else setError(r.error);
  }

  return (
    <div className="stack">
      <div className="row-between">
        <PageTitle title={spec.title} sub={`${spec.business.name} · ${spec.months} months`} />
        <div className="row rise rise-2">{locked ? <Badge kind="ready">Published</Badge> : <Badge kind="draft">Draft</Badge>}</div>
      </div>
      {notices.length > 0 ? (
        <div className="alert warn" role="status">
          <strong>Have a look before publishing</strong>
          <ul>
            {notices.slice(0, 12).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="alert ok">Played 13 times with random decisions: every formula works and the books always balance.</p>
      )}
      {sources.length > 0 && <p className="hint">Slides the AI read: {sources.map((s) => `${s.lecture ? `${s.lecture}, ` : ""}${s.title} p.${s.pageNo}`).join(" · ")}</p>}
      {spec.teacherNotes && (
        <p className="alert info">
          <strong>Notes for you:</strong> {spec.teacherNotes}
        </p>
      )}

      <div className="row-between">
        <Tabs<Tab>
          label="View"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "play", label: "Test play" },
            { value: "edit", label: locked ? "Formulas" : "Edit" },
          ]}
        />
        <div className="row">
          {!locked && (
            <button className="btn btn-secondary" type="button" onClick={save} disabled={!dirty || busy !== null}>
              {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
          )}
          {!locked && (
            <ConfirmButton
              className="btn btn-primary"
              label={busy === "publish" ? "Publishing…" : "Publish"}
              question="Publish? The simulation is locked after this (you can still copy it)."
              confirmLabel="Publish"
              onConfirm={publish}
              disabled={analysis.errors.length > 0 || busy !== null}
            />
          )}
          {locked && (
            <form action={copySim.bind(null, id)}>
              <button className="btn btn-secondary" type="submit">
                Make a copy to change it
              </button>
            </form>
          )}
          <Link className="btn btn-special" href={`/t/sims/${id}/assign`}>
            Give to a class
          </Link>
        </div>
      </div>
      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}

      {tab === "overview" && <Overview spec={spec} />}
      {tab === "play" && (analysis.errors.length ? <p className="alert warn">Fix the problems above to test play.</p> : <TestPlay spec={spec} />)}
      {tab === "edit" && <SimEditor spec={spec} onChange={locked ? undefined : setSpec} />}

      {!locked && (
        <section className="card tint-purple stack-sm">
          <h2>Ask the AI to change it</h2>
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Add a decision to sell on credit to a hotel, with a customer who pays late in month 3"
            aria-label="What should the AI change?"
          />
          <div className="row">
            <button className="btn btn-primary" type="button" onClick={revise} disabled={!instruction.trim() || busy !== null}>
              {busy === "revise" ? "The AI is working…" : "Change it"}
            </button>
            {busy === "revise" && <span className="muted">This can take a minute or two.</span>}
          </div>
        </section>
      )}
      {versions.length > 0 && (
        <section className="stack-sm">
          <h2>Older versions</h2>
          <div className="table-wrap">
            <table className="list">
              <tbody>
                {versions.map((v, i) => (
                  <tr key={v.id}>
                    <td className="mono">{fmtDate(v.createdAt)}</td>
                    <td>{v.note}</td>
                    <td style={{ textAlign: "right" }}>
                      {i === 0 ? (
                        <span className="badge b-yellow">Current</span>
                      ) : (
                        !locked && (
                          <form action={restoreSimVersion.bind(null, id, v.id)}>
                            <button className="btn-text" type="submit">
                              Bring back
                            </button>
                          </form>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Toast message={toast} />
    </div>
  );
}

function Overview({ spec }: { spec: SimSpec }) {
  return (
    <div className="stack">
      <section className="card stack-sm">
        <h2>{spec.business.name}</h2>
        <p className="lead">{spec.story}</p>
      </section>
      <div className="grid-2">
        <section className="card stack-sm">
          <h2>Decisions each month</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {spec.decisions.map((d) => (
              <li key={d.name}>
                <strong>{d.label}</strong>{" "}
                <span className="muted">
                  {d.kind === "number" ? `${formatAmount(d.min!)}–${formatAmount(d.max!)} ${d.unit ?? ""}` : d.kind === "toggle" ? "yes / no" : d.options!.map((o) => o.label).join(" / ")} · default{" "}
                  {formatAmount(d.default)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card stack-sm">
          <h2>Events</h2>
          {spec.events.length === 0 && <p className="muted">No events.</p>}
          {[...spec.events]
            .sort((a, b) => a.month - b.month)
            .map((e) => (
              <p key={e.month + e.title}>
                <span className="badge b-pink">{spec.monthLabels[e.month - 1] || `Month ${e.month}`}</span> <strong>{e.title}</strong>
              </p>
            ))}
          <p className="hint">
            Score: {spec.score.label} (poor {formatAmount(spec.score.poor)}, excellent {formatAmount(spec.score.excellent)}).
          </p>
        </section>
      </div>
      <section className="card stack-sm">
        <h2>Student tasks by month</h2>
        <table className="list">
          <tbody>{Array.from({ length: spec.months }, (_, i) => {
            const work = spec.monthWork.find((w) => w.month === i + 1);
            return <tr key={i}><th scope="row">{spec.monthLabels[i] || `Month ${i + 1}`}</th><td>
              {work && <strong>{work.title}<br /></strong>}
              {(work?.parts ?? spec.monthParts).map((p) => p.title).join(" · ")}
            </td></tr>;
          })}</tbody>
        </table>
        <p className="hint">You can ask the AI to change an upcoming month's tasks from the class's control room.</p>
      </section>
    </div>
  );
}

function TestPlay({ spec }: { spec: SimSpec }) {
  const [plan, setPlan] = useState<Values[]>(() => Array.from({ length: spec.months }, () => defaultDecisions(spec)));
  const [month, setMonth] = useState(1);
  const results = useMemo(() => {
    try {
      return runCompany(spec, plan, spec.months);
    } catch {
      return null;
    }
  }, [spec, plan]);
  if (!results) return <p className="alert warn">This simulation can't run with these decisions.</p>;
  const r = results[month - 1];
  const ex = monthExercise(spec, r);
  const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
  const score = businessScore(spec, results);
  const sv = statementsView(spec, r);
  return (
    <div className="stack">
      <Tabs<string> label="Month" value={String(month)} onChange={(v) => setMonth(Number(v))} tabs={results.map((x) => ({ value: String(x.month), label: x.label }))} />
      <div className="grid-2">
        <section className="card stack-sm">
          <h2>Decisions for {r.label}</h2>
          <DecisionControls decisions={spec.decisions} value={plan[month - 1]} onChange={(v) => setPlan((p) => p.map((x, i) => (i === month - 1 ? v : x)))} />
        </section>
        <div className="stack-sm">
          {r.event && <EventCard title={r.event.title} text={r.event.text} />}
          {r.feedback.length > 0 && (
            <div className="alert info">
              <ul style={{ margin: 0 }}>
                {r.feedback.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="card ink">
            <p className="label muted">Business score after {spec.months} months</p>
            <p className="big-num">{formatAmount(score.raw)}</p>
            <p className="muted">{Math.round(score.pct * 100)}% of the way from poor to excellent</p>
          </div>
        </div>
      </div>
      <MetricCharts labels={results.map((x) => x.label)} series={spec.metrics.map((m, i) => ({ label: m.label, kind: m.kind, values: results.map((x) => x.metrics[i]) }))} />
      <h2>Answer key for {r.label}</h2>
      <Sheet view={buildView(ex, params)} answers={perfectAnswers(ex, params)} />
      {sv && (
        <>
          <h2>Statements students see after {r.label}</h2>
          <Sheet view={sv} answers={{}} hideStory />
        </>
      )}
    </div>
  );
}

/* ---------------- editor ---------------- */

type Col = { key: string; label: string; kind?: "text" | "num" | "formula" | "select"; options?: string[]; width?: number };

function FieldTable<T extends Record<string, unknown>>({
  title,
  hint,
  rows,
  cols,
  onChange,
  make,
}: {
  title: string;
  hint?: string;
  rows: T[];
  cols: Col[];
  onChange?: (rows: T[]) => void;
  make: () => T;
}) {
  const set = (i: number, key: string, v: unknown) => onChange?.(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <section className="card stack-sm">
      <h2>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => {
                  const v = r[c.key];
                  const common = { "aria-label": c.label, disabled: !onChange, style: { minWidth: c.width ?? 110 } };
                  return (
                    <td key={c.key}>
                      {c.kind === "select" ? (
                        <select className="select" {...common} value={String(v ?? "")} onChange={(e) => set(i, c.key, e.target.value)}>
                          {c.options!.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : c.kind === "num" ? (
                        <input
                          className="input num"
                          type="number"
                          {...common}
                          value={v === undefined ? "" : String(v)}
                          onChange={(e) => set(i, c.key, e.target.value === "" ? undefined : Number(e.target.value))}
                        />
                      ) : (
                        <input className={`input${c.kind === "formula" ? " mono" : ""}`} {...common} value={String(v ?? "")} onChange={(e) => set(i, c.key, e.target.value)} />
                      )}
                    </td>
                  );
                })}
                <td>
                  {onChange && (
                    <button type="button" className="btn-text danger" aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onChange && (
        <button type="button" className="btn btn-secondary btn-small" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...rows, make()])}>
          + Add
        </button>
      )}
    </section>
  );
}

function SimEditor({ spec, onChange }: { spec: SimSpec; onChange?: (s: SimSpec) => void }) {
  const ro = !onChange;
  const up = <K extends keyof SimSpec>(k: K, v: SimSpec[K]) => onChange?.({ ...spec, [k]: v });
  const [bookMonth, setBookMonth] = useState(1);
  const selectedMonth = Math.min(bookMonth || 1, spec.months);
  const monthResult = useMemo(() => {
    try {
      return runCompany(spec, [], selectedMonth)[selectedMonth - 1];
    } catch {
      return null;
    }
  }, [spec, selectedMonth]);
  const work = spec.monthWork.find((w) => w.month === selectedMonth);
  const books: ExerciseSpec | null = monthResult ? {
    ...monthExercise(spec, monthResult),
    ...(bookMonth === 0 ? { parts: spec.monthParts, transactions: spec.monthTransactions } : {}),
  } : null;
  const [json, setJson] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  return (
    <div className="stack">
      {ro && <p className="alert info">Published simulations are locked. Make a copy to change it.</p>}
      <section className="card stack-sm">
        <h2>Business and story</h2>
        <div className="grid-2">
          {(
            [
              ["title", "Title"],
              ["currency", "Currency"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="field">
              <span className="label">{l}</span>
              <input className="input" disabled={ro} value={spec[k]} onChange={(e) => up(k, e.target.value)} />
            </label>
          ))}
          <label className="field">
            <span className="label">Business name</span>
            <input className="input" disabled={ro} value={spec.business.name} onChange={(e) => up("business", { ...spec.business, name: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Month names (comma separated)</span>
            <input className="input" disabled={ro} value={spec.monthLabels.join(", ")} onChange={(e) => up("monthLabels", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </label>
        </div>
        <label className="field">
          <span className="label">Story</span>
          <textarea className="textarea" disabled={ro} value={spec.story} onChange={(e) => up("story", e.target.value)} />
        </label>
      </section>
      <FieldTable
        title="Decisions"
        hint="Kind: number (slider between min and max), toggle (yes/no = 1/0) or choice (options: edit in JSON)."
        rows={spec.decisions as unknown as Record<string, unknown>[]}
        cols={[
          { key: "name", label: "Name", kind: "formula" },
          { key: "label", label: "Label", width: 200 },
          { key: "kind", label: "Kind", kind: "select", options: ["number", "toggle", "choice"] },
          { key: "min", label: "Min", kind: "num", width: 80 },
          { key: "max", label: "Max", kind: "num", width: 80 },
          { key: "step", label: "Step", kind: "num", width: 80 },
          { key: "default", label: "Default", kind: "num", width: 80 },
          { key: "unit", label: "Unit", width: 70 },
          { key: "help", label: "Help text", width: 220 },
        ]}
        onChange={onChange && ((rows) => up("decisions", rows as never))}
        make={() => ({ name: `decision${spec.decisions.length + 1}`, label: "New decision", kind: "number", min: 0, max: 100, step: 10, default: 50 })}
      />
      <FieldTable
        title="Constants"
        rows={spec.constants as unknown as Record<string, unknown>[]}
        cols={[
          { key: "name", label: "Name", kind: "formula" },
          { key: "label", label: "Label", width: 220 },
          { key: "value", label: "Value", kind: "num" },
        ]}
        onChange={onChange && ((rows) => up("constants", rows as never))}
        make={() => ({ name: `const${spec.constants.length + 1}`, label: "", value: 0 })}
      />
      <FieldTable
        title="What carries over month to month"
        hint="In formulas, X is the value at the start of a month and X_end at the end."
        rows={spec.state as unknown as Record<string, unknown>[]}
        cols={[
          { key: "name", label: "Name", kind: "formula" },
          { key: "label", label: "Label", width: 160 },
          { key: "opening", label: "Start of month 1", kind: "formula", width: 160 },
          { key: "closing", label: "End of month", kind: "formula", width: 320 },
          { key: "kind", label: "Kind", kind: "select", options: ["money", "count"] },
        ]}
        onChange={onChange && ((rows) => up("state", rows as never))}
        make={() => ({ name: `item${spec.state.length + 1}`, label: "", opening: "0", closing: `item${spec.state.length + 1}`, kind: "money" })}
      />
      <FieldTable
        title="The business model (each month)"
        rows={spec.derived as unknown as Record<string, unknown>[]}
        cols={[
          { key: "name", label: "Name", kind: "formula" },
          { key: "label", label: "Label", width: 180 },
          { key: "expr", label: "Formula", kind: "formula", width: 420 },
        ]}
        onChange={onChange && ((rows) => up("derived", rows as never))}
        make={() => ({ name: `value${spec.derived.length + 1}`, label: "", expr: "0" })}
      />
      <FieldTable
        title="Event variables"
        rows={spec.eventVars as unknown as Record<string, unknown>[]}
        cols={[
          { key: "name", label: "Name", kind: "formula" },
          { key: "label", label: "Label", width: 200 },
          { key: "default", label: "Normal value", kind: "num" },
        ]}
        onChange={onChange && ((rows) => up("eventVars", rows as never))}
        make={() => ({ name: `event${spec.eventVars.length + 1}`, label: "", default: 0 })}
      />
      <FieldTable
        title="Events (what they change: edit in JSON)"
        rows={spec.events as unknown as Record<string, unknown>[]}
        cols={[
          { key: "month", label: "Month", kind: "num", width: 70 },
          { key: "title", label: "Title", width: 200 },
          { key: "text", label: "Text students see", width: 420 },
        ]}
        onChange={onChange && ((rows) => up("events", rows as never))}
        make={() => ({ month: 1, title: "New event", text: "", set: {} })}
      />
      <FieldTable
        title="Charts on the results screen"
        rows={spec.metrics as unknown as Record<string, unknown>[]}
        cols={[
          { key: "label", label: "Label", width: 180 },
          { key: "expr", label: "Formula", kind: "formula", width: 260 },
          { key: "kind", label: "Kind", kind: "select", options: ["money", "count", "percent"] },
        ]}
        onChange={onChange && ((rows) => up("metrics", rows as never))}
        make={() => ({ label: "New chart", expr: "0", kind: "money" })}
      />
      <FieldTable
        title="Feedback notes"
        rows={spec.feedback as unknown as Record<string, unknown>[]}
        cols={[
          { key: "when", label: "Show when", kind: "formula", width: 220 },
          { key: "text", label: "Note", width: 420 },
        ]}
        onChange={onChange && ((rows) => up("feedback", rows as never))}
        make={() => ({ when: "1", text: "" })}
      />
      <FieldTable
        title="Checks (true every month for any decisions)"
        rows={spec.checks as unknown as Record<string, unknown>[]}
        cols={[
          { key: "label", label: "Label", width: 220 },
          { key: "expr", label: "Formula", kind: "formula", width: 420 },
        ]}
        onChange={onChange && ((rows) => up("checks", rows as never))}
        make={() => ({ label: "New check", expr: "1 == 1" })}
      />
      <section className="card stack-sm">
        <h2>Business score</h2>
        <div className="grid-2">
          <label className="field">
            <span className="label">What it means</span>
            <input className="input" disabled={ro} value={spec.score.label} onChange={(e) => up("score", { ...spec.score, label: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Formula (total_X, min_X_end, max_X_end allowed)</span>
            <input className="input mono" disabled={ro} value={spec.score.expr} onChange={(e) => up("score", { ...spec.score, expr: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Poor (0%)</span>
            <input className="input num" type="number" disabled={ro} value={spec.score.poor} onChange={(e) => up("score", { ...spec.score, poor: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">Excellent (100%)</span>
            <input className="input num" type="number" disabled={ro} value={spec.score.excellent} onChange={(e) => up("score", { ...spec.score, excellent: Number(e.target.value) })} />
          </label>
        </div>
      </section>
      <h2>Student tasks by month</h2>
      <label className="field">
        <span className="label">Month to edit</span>
        <select className="input" value={bookMonth} onChange={(e) => setBookMonth(Number(e.target.value))}>
          <option value={0}>Shared default tasks</option>
          {Array.from({ length: spec.months }, (_, i) => <option key={i} value={i + 1}>{spec.monthLabels[i] || `Month ${i + 1}`}</option>)}
        </select>
      </label>
      <p className="hint">Numbers use the selected month with default decisions. Editing a month creates its own tasks. Shared defaults apply to months without their own plan.</p>
      {books ? (
        <SpecEditor
          key={bookMonth}
          booksOnly
          spec={books}
          onChange={onChange && ((s) => onChange(bookMonth === 0 ? { ...spec, monthParts: s.parts, monthTransactions: s.transactions } : withMonthWork(spec, [{
            month: selectedMonth,
            title: work?.title ?? `${spec.business.name} · ${monthResult!.label}`,
            instructions: work?.instructions ?? "",
            parts: s.parts,
            transactions: s.transactions,
          }])))}
        />
      ) : (
        <p className="alert warn">Fix the model first: this month can't be calculated.</p>
      )}
      {!ro && (
        <details className="card small">
          <summary className="btn-text" style={{ display: "inline-flex" }} onClick={() => setJson(JSON.stringify(spec, null, 2))}>
            Advanced: edit everything as JSON
          </summary>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            <textarea className="textarea mono" style={{ minHeight: 360, fontSize: 13 }} value={json} onChange={(e) => setJson(e.target.value)} aria-label="Simulation JSON" />
            {jsonErr && <p className="alert warn">{jsonErr}</p>}
            <button
              type="button"
              className="btn btn-secondary btn-small"
              style={{ alignSelf: "flex-start" }}
              onClick={() => {
                try {
                  const r = SimSpecSchema.safeParse(JSON.parse(json));
                  if (!r.success) return setJsonErr(r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
                  setJsonErr(null);
                  onChange!(r.data);
                } catch {
                  setJsonErr("That isn't valid JSON.");
                }
              }}
            >
              Apply JSON
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
