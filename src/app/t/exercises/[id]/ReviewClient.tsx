"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ExerciseSpec } from "@/lib/spec/schema";
import { analyze, buildView, defaultParams, paramsForSeed, perfectAnswers, type Values } from "@/lib/spec/engine";
import { formatAmount } from "@/lib/spec/format";
import { Sheet } from "@/components/sheet/Sheet";
import { Badge, PageTitle, fmtDate } from "@/components/ui/bits";
import { ConfirmButton, Tabs, Toast } from "@/components/ui/client";
import { copyExercise, publishExercise, restoreVersion, reviseExercise, saveExercise } from "@/app/actions/teacher";
import { SpecEditor } from "./SpecEditor";

type Tab = "student" | "key" | "edit" | "versions";

export function ReviewClient({
  id,
  status,
  spec: initial,
  savedWarnings,
  sources,
  versions,
  used,
}: {
  id: string;
  status: "draft" | "published";
  spec: ExerciseSpec;
  savedWarnings: string[];
  sources: { title: string; lecture: string | null; pageNo: number }[];
  versions: { id: number; note: string; createdAt: string }[];
  used: number;
}) {
  const router = useRouter();
  const locked = status === "published";
  const [spec, setSpec] = useState<ExerciseSpec>(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [tab, setTab] = useState<Tab>("student");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "publish" | "revise">(null);
  const [instruction, setInstruction] = useState("");
  const [seed, setSeed] = useState<number>(0);
  const dirty = JSON.stringify(spec) !== baseline;

  // Keep in sync if the server sends a new spec (after AI revise or restore).
  const initialJson = JSON.stringify(initial);
  const [lastInitial, setLastInitial] = useState(initialJson);
  if (initialJson !== lastInitial) {
    setLastInitial(initialJson);
    setSpec(initial);
    setBaseline(initialJson);
  }

  const analysis = useMemo(() => analyze(spec), [spec]);
  const defaults = useMemo(() => defaultParams(spec), [spec]);
  const safe = analysis.errors.length === 0;
  const view = useMemo(() => (safe ? buildView(spec, defaults) : null), [spec, defaults, safe]);
  const key = useMemo(() => (safe ? perfectAnswers(spec, defaults) : null), [spec, defaults, safe]);
  const variant = useMemo<Values | null>(() => (safe && seed ? paramsForSeed(spec, seed) : null), [spec, seed, safe]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  async function save() {
    setBusy("save");
    setError(null);
    const r = await saveExercise(id, JSON.stringify(spec));
    setBusy(null);
    if (r.ok) {
      setBaseline(JSON.stringify(spec));
      flash("Saved");
      router.refresh();
    } else setError(r.error);
  }

  async function publish() {
    if (dirty) {
      const r = await saveExercise(id, JSON.stringify(spec));
      if (!r.ok) return setError(r.error);
      setBaseline(JSON.stringify(spec));
    }
    setBusy("publish");
    const r = await publishExercise(id);
    setBusy(null);
    if (r.ok) {
      flash("Published");
      router.refresh();
    } else setError(r.error);
  }

  async function revise() {
    if (dirty) {
      const s = await saveExercise(id, JSON.stringify(spec), "Edited before AI change");
      if (!s.ok) return setError(s.error);
    }
    setBusy("revise");
    setError(null);
    const r = await reviseExercise(id, instruction);
    setBusy(null);
    if (r.ok) {
      setInstruction("");
      flash("The AI changed it");
      router.refresh();
    } else setError(r.error);
  }

  const failed = analysis.checks.filter((c) => !c.ok);
  const outOfCourse = spec.outOfCourse;
  const notices = [...analysis.errors, ...failed.map((c) => `Check failed (${c.where}): ${c.label}${c.error ? ` – ${c.error}` : ""}`)];

  return (
    <div className="stack">
      <div className="row-between">
        <PageTitle title={spec.title} sub={spec.business.name} />
        <div className="row rise rise-2">
          {locked ? <Badge kind="ready">Published</Badge> : <Badge kind="draft">Draft</Badge>}
          {used > 0 && <Badge kind="info">Assigned {used}×</Badge>}
        </div>
      </div>

      {(notices.length > 0 || outOfCourse.length > 0) && (
        <div className="alert warn rise rise-2" role="status">
          <strong>Have a look before publishing</strong>
          <ul>
            {notices.map((n, i) => (
              <li key={`n${i}`}>{n}</li>
            ))}
            {outOfCourse.map((o, i) => (
              <li key={`o${i}`}>Not from your slides: {o}</li>
            ))}
          </ul>
        </div>
      )}
      {notices.length === 0 && savedWarnings.length === 0 && outOfCourse.length === 0 && (
        <p className="alert ok rise rise-2">All answers add up and every check passes.</p>
      )}
      {sources.length > 0 && (
        <p className="hint rise rise-2">
          Slides the AI read:{" "}
          {sources.map((s, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {s.lecture ? `${s.lecture}, ` : ""}
              {s.title} p.{s.pageNo}
            </span>
          ))}
        </p>
      )}
      {spec.teacherNotes && (
        <p className="alert info rise rise-2">
          <strong>Notes for you:</strong> {spec.teacherNotes}
        </p>
      )}

      <div className="row-between rise rise-3">
        <Tabs<Tab>
          label="View"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "student", label: "Student view" },
            { value: "key", label: "Answer key" },
            { value: "edit", label: locked ? "Formulas" : "Edit" },
            { value: "versions", label: "Other versions" },
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
              question="Publish? The exercise is locked after this (you can still copy it)."
              confirmLabel="Publish"
              onConfirm={publish}
              disabled={!safe || busy !== null}
            />
          )}
          {locked && (
            <form action={copyExercise.bind(null, id)}>
              <button className="btn btn-secondary" type="submit">
                Make a copy to change it
              </button>
            </form>
          )}
          <Link className="btn btn-special" href={`/t/exercises/${id}/assign`} aria-disabled={!safe}>
            Give to a class
          </Link>
        </div>
      </div>
      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}

      {tab === "student" &&
        (view ? (
          <Sheet view={view} answers={{}} />
        ) : (
          <p className="alert warn">Fix the problems above to see the student view.</p>
        ))}
      {tab === "key" &&
        (view && key ? (
          <Sheet view={view} answers={key} />
        ) : (
          <p className="alert warn">Fix the problems above to see the answer key.</p>
        ))}
      {tab === "edit" && <SpecEditor spec={spec} onChange={locked ? undefined : setSpec} />}
      {tab === "versions" && (
        <section className="stack">
          <div className="card small row-between">
            <p>
              When you choose <strong>different numbers for each student</strong>, each one gets amounts picked inside the min–max ranges below, and only sets that pass every check.
            </p>
            <button className="btn btn-primary btn-small" type="button" onClick={() => setSeed(1 + Math.floor(Math.random() * 1e9))} disabled={!safe}>
              Show a random version
            </button>
          </div>
          {spec.params.some((p) => p.min === undefined || p.max === undefined) && (
            <p className="hint">Amounts without a min and max stay the same for everyone.</p>
          )}
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th className="num">Original</th>
                  <th className="num">Range</th>
                  {variant && <th className="num">This version</th>}
                </tr>
              </thead>
              <tbody>
                {spec.params.map((p) => (
                  <tr key={p.name}>
                    <td>{p.label ?? p.name}</td>
                    <td className="num">{formatAmount(p.value)}</td>
                    <td className="num">{p.min !== undefined && p.max !== undefined ? `${formatAmount(p.min)}–${formatAmount(p.max)}` : "fixed"}</td>
                    {variant && <td className="num">{formatAmount(variant[p.name])}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {variant && <Sheet key={seed} view={buildView(spec, variant)} answers={perfectAnswers(spec, variant)} />}
        </section>
      )}

      {!locked && (
        <section className="card tint-purple stack-sm">
          <h2>Ask the AI to change it</h2>
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Make transaction 6 trickier, or add a balance sheet part"
            aria-label="What should the AI change?"
          />
          <div className="row">
            <button className="btn btn-primary" type="button" onClick={revise} disabled={!instruction.trim() || busy !== null}>
              {busy === "revise" ? "The AI is working…" : "Change it"}
            </button>
            {busy === "revise" && <span className="muted">This can take up to a minute.</span>}
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
                          <form action={restoreVersion.bind(null, id, v.id)}>
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
