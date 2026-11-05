"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AiWorking, ChoiceGroup, DropZone } from "@/components/ui/client";
import { generateExercise } from "@/app/actions/teacher";

const PARTS = [
  { value: "transaction analysis table", label: "Transaction table" },
  { value: "journal entries", label: "Journal entries" },
  { value: "financial statements", label: "Financial statements" },
  { value: "number questions", label: "Number questions" },
  { value: "auto", label: "Let the AI decide" },
];

export function CreateForm({ vision }: { vision: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const r = await generateExercise(fd).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (r.ok) {
      setDone(true);
      router.push(`/t/exercises/${r.id}`);
    } else {
      setBusy(false);
      setError(r.error);
    }
  }

  if (busy) {
    return done ? (
      <div className="card hero ai-working" role="status">
        <span className="sticker">Draft ready</span>
        <p className="card-title">Opening it for you to check…</p>
      </div>
    ) : (
      <AiWorking steps={["Reading your slides…", "Writing the exercise…", "Checking the answers…"]} />
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(new FormData(e.currentTarget));
      }}
    >
      <section className="card hero rise rise-2">
        <label className="field">
          <span className="card-title">Describe the exercise you want</span>
          <textarea
            className="textarea"
            name="prompt"
            rows={5}
            placeholder="e.g. A car-wash in Muscat, 10 transactions for the accounting equation, include an owner withdrawal and a personal expense. Then ask for net income."
          />
        </label>
      </section>

      <section className="card rise rise-3">
        <div className="stack">
          <h2>Helpers (optional)</h2>
          <div className="grid-2">
            <label className="field">
              <span className="label">Business idea</span>
              <input className="input" name="business" placeholder="Leave empty: the AI invents an Omani business" />
            </label>
            <label className="field">
              <span className="label">Topic</span>
              <input className="input" name="topic" placeholder="e.g. Accounting equation, adjusting entries, break-even" />
            </label>
            <label className="field">
              <span className="label">Number of transactions</span>
              <input className="input num" name="transactions" type="number" min={1} max={30} placeholder="10" />
            </label>
            <div className="grid-2" style={{ gap: 14 }}>
              <label className="field">
                <span className="label">Currency</span>
                <input className="input" name="currency" defaultValue="OMR" maxLength={10} />
              </label>
              <label className="field">
                <span className="label">Period</span>
                <input className="input" name="period" placeholder="March 2026" />
              </label>
            </div>
          </div>
          <ChoiceGroup
            name="difficulty"
            label="Difficulty"
            defaultValue="medium"
            options={[
              { value: "easy", title: "Easy", text: "Straightforward transactions" },
              { value: "medium", title: "Medium", text: "A couple of traps" },
              { value: "hard", title: "Hard", text: "Tricky items, more steps" },
            ]}
          />
          <label className="field">
            <span className="label">Things that must be included</span>
            <input className="input" name="mustInclude" placeholder="Separate with commas: prepaid rent, owner withdrawal, personal expense" />
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Parts you want</legend>
            <div className="row">
              {PARTS.map((p) => (
                <label key={p.value} className="check-row" style={{ background: "var(--field)", borderRadius: 999, padding: "0 16px" }}>
                  <input type="checkbox" name="parts" value={p.value} defaultChecked={p.value === "auto"} /> {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="check-row">
            <input type="checkbox" name="useLibrary" defaultChecked /> Use my lecture slides as the reference
          </label>
        </div>
      </section>

      <section className="rise rise-4">
        <DropZone
          name="sample"
          accept={vision ? ".pdf,.pptx,.png,.jpg,.jpeg,.webp" : ".pdf,.pptx"}
          title="Make one like this (optional)"
          text={vision ? "Upload an old exercise: PDF, PowerPoint or a screenshot" : "Upload an old exercise as PDF or PowerPoint"}
        />
      </section>

      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn btn-special" type="submit">
          ✦ Generate
        </button>
      </div>
    </form>
  );
}
