"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SimDecision } from "@/lib/sim/schema";
import type { ExerciseView, StudentAnswers, GridAnswers, JournalAnswers, NumericAnswers } from "@/lib/spec/engine";
import { Sheet } from "@/components/sheet/Sheet";
import { ConfirmButton } from "@/components/ui/client";
import { DecisionControls } from "@/components/sim/DecisionForm";
import { lockDecisions, submitMonthBooks } from "@/app/actions/sim";

export function DecideClient({ runId, decisions, initial }: { runId: string; decisions: SimDecision[]; initial: Record<string, number> }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card hero stack-sm">
      <h2>Your decisions this month</h2>
      <DecisionControls decisions={decisions} value={value} onChange={setValue} />
      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <ConfirmButton
          className="btn btn-special"
          label="Lock in my decisions"
          question="Lock in? You can't change them this month. Then you'll see what happens."
          confirmLabel="Lock in"
          onConfirm={async () => {
            const r = await lockDecisions(runId, value);
            if (r.ok) router.refresh();
            else setError(r.error);
          }}
        />
      </div>
    </section>
  );
}

const KEY = (draftId: string) => `accsim-books-${draftId}`;

export function RecordClient({ runId, draftId, view }: { runId: string; draftId: string; view: ExerciseView }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<StudentAnswers>({});
  // Restore an unsent draft after mount (keeps server and browser HTML the same).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY(draftId));
      if (saved) setAnswers(JSON.parse(saved) as StudentAnswers);
    } catch {
      /* storage unavailable */
    }
  }, [draftId]);
  const [error, setError] = useState<string | null>(null);
  const onChange = (partId: string, v: GridAnswers | JournalAnswers | NumericAnswers) => {
    const next = { ...answers, [partId]: v };
    setAnswers(next);
    try {
      localStorage.setItem(KEY(draftId), JSON.stringify(next));
    } catch {
      /* storage unavailable: answers stay in memory */
    }
  };
  return (
    <div className="stack">
      <Sheet view={view} answers={answers} onChange={onChange} />
      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}
      <div className="card ink row-between">
        <div>
          <p className="card-title">Books done?</p>
          <p className="muted">You'll see your marks, the corrections and the real statements right after.</p>
        </div>
        <ConfirmButton
          className="btn btn-special"
          label="Hand in this month"
          question="Hand in this month's books? You can't change them after."
          confirmLabel="Hand in"
          onConfirm={async () => {
            const r = await submitMonthBooks(runId, answers);
            if (r.ok) {
              try {
                localStorage.removeItem(KEY(draftId));
              } catch {
                /* ignore */
              }
              router.refresh();
            } else setError(r.error);
          }}
        />
      </div>
    </div>
  );
}
