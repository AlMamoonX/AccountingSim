"use client";

import { useState } from "react";
import Link from "next/link";
import { ChoiceGroup } from "@/components/ui/client";
import { createSimRun } from "@/app/actions/sim";

const muscatLocal = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16);

export function SimAssignForm({ simId, classes, months }: { simId: string; classes: { id: string; name: string; students: number }[]; months: number }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [weight, setWeight] = useState(70);
  const [deadline, setDeadline] = useState(muscatLocal(new Date(Date.now() + months * 7 * 86400_000)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!classes.length)
    return (
      <div className="card small stack-sm">
        <p>You have no open classes yet.</p>
        <Link href="/t/classes" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
          Create a class
        </Link>
      </div>
    );
  const cls = classes.find((c) => c.id === classId);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const r = await createSimRun(fd);
        if (r && !r.ok) {
          setError(r.error);
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="simId" value={simId} />
      <section className="card">
        <ChoiceGroup name="classId" label="Class" defaultValue={classId} onChange={setClassId} options={classes.map((c) => ({ value: c.id, title: c.name, text: `${c.students} students` }))} />
      </section>
      <section className="card stack-sm">
        <label className="field">
          <span className="label">
            Final mark: <span className="mono">{weight}%</span> keeping the books right + <span className="mono">{100 - weight}%</span> running the business well
          </span>
          <input className="slider" type="range" name="accountingWeight" min={0} max={100} step={5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
        </label>
        <label className="field" style={{ maxWidth: 320 }}>
          <span className="label">Final deadline (Muscat time)</span>
          <input className="input mono" type="datetime-local" name="deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
        </label>
        <p className="hint">Month 1 opens now. You open each next month yourself from the control room (e.g. one per lecture).</p>
      </section>
      <section className="card ink">
        <p className="card-title">
          {cls?.name} · {months} months · {weight}/{100 - weight}
        </p>
        <p className="muted">The simulation will be published (locked) when you confirm.</p>
      </section>
      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="btn btn-special" type="submit" disabled={busy}>
          {busy ? "Starting…" : "Start the simulation"}
        </button>
      </div>
    </form>
  );
}
