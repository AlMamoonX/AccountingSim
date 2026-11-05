"use client";

import { useState } from "react";
import Link from "next/link";
import { ChoiceGroup } from "@/components/ui/client";
import { createAssignment } from "@/app/actions/teacher";

/** "YYYY-MM-DDTHH:mm" in Muscat time (UTC+4), for datetime-local inputs. */
function muscatLocal(d: Date) {
  return new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16);
}

export function AssignForm({
  exerciseId,
  classes,
  canVary,
  published,
}: {
  exerciseId: string;
  classes: { id: string; name: string; students: number }[];
  canVary: boolean;
  published: boolean;
}) {
  const now = new Date();
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [mode, setMode] = useState("practice");
  const [variant, setVariant] = useState(canVary ? "unique" : "same");
  const [opensAt, setOpensAt] = useState(muscatLocal(now));
  const [deadline, setDeadline] = useState(muscatLocal(new Date(now.getTime() + 7 * 86400_000)));
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
  const pretty = (v: string) =>
    new Date(`${v}:00+04:00`).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const r = await createAssignment(fd);
        // On success the action redirects to the marks page.
        if (r && !r.ok) {
          setError(r.error);
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="exerciseId" value={exerciseId} />
      <section className="card rise rise-2">
        <ChoiceGroup
          name="classId"
          label="Class"
          defaultValue={classId}
          onChange={setClassId}
          options={classes.map((c) => ({ value: c.id, title: c.name, text: `${c.students} students` }))}
        />
      </section>
      <section className="card rise rise-3">
        <ChoiceGroup
          name="mode"
          label="Mode"
          defaultValue={mode}
          onChange={setMode}
          options={[
            { value: "practice", title: "Practice", text: "Students can check their answers while they work. Marks show after hand-in." },
            { value: "graded", title: "Graded", text: "No checking. Students see marks only after the deadline." },
          ]}
        />
      </section>
      <section className="card rise rise-4">
        <ChoiceGroup
          name="variantMode"
          label="Numbers"
          defaultValue={variant}
          onChange={setVariant}
          options={[
            { value: "same", title: "Same for everyone", text: "Easy to discuss together in class." },
            ...(canVary ? [{ value: "unique", title: "Different for each student", text: "Same story and steps, own amounts. Stops copying." }] : []),
          ]}
        />
        {!canVary && <p className="hint">This exercise has no amount ranges, so everyone gets the same numbers.</p>}
      </section>
      <section className="card rise rise-5">
        <div className="grid-2">
          <label className="field">
            <span className="label">Start (Muscat time)</span>
            <input className="input mono" type="datetime-local" name="opensAt" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} required />
          </label>
          <label className="field">
            <span className="label">Deadline (Muscat time)</span>
            <input className="input mono" type="datetime-local" name="deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
          </label>
        </div>
      </section>

      <section className="card ink">
        <div className="stack-sm">
          <span className="label muted">Summary</span>
          <p className="card-title">
            {cls?.name ?? "—"} · {mode === "practice" ? "Practice" : "Graded"} · {variant === "unique" ? "own numbers per student" : "same numbers"}
          </p>
          <p className="muted">
            Opens {opensAt && pretty(opensAt)} · due {deadline && pretty(deadline)}
          </p>
          {!published && <p className="muted">The exercise will be published (locked) when you confirm.</p>}
        </div>
      </section>
      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="btn btn-special" type="submit" disabled={busy}>
          {busy ? "Giving…" : "Give to the class"}
        </button>
      </div>
    </form>
  );
}
