"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SimMonthWork, SimSpec } from "@/lib/sim/schema";
import { monthExercise, monthLabel, runCompany } from "@/lib/sim/engine";
import { withMonthWork } from "@/lib/sim/work";
import { buildView, grade, perfectAnswers } from "@/lib/spec/engine";
import { Sheet } from "@/components/sheet/Sheet";
import { AiWorking, Tabs } from "@/components/ui/client";
import { applyMonthWork, draftMonthWork } from "@/app/actions/sim";

export function MonthWorkEditor({ runId, openedMonth, spec }: { runId: string; openedMonth: number; spec: SimSpec }) {
  const router = useRouter();
  const [month, setMonth] = useState(openedMonth + 1);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<SimMonthWork | null>(null);
  const [busy, setBusy] = useState<"generate" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [view, setView] = useState<"student" | "key">("student");
  const preview = useMemo(() => {
    if (!draft) return null;
    const candidate = withMonthWork(spec, [draft]);
    const result = runCompany(candidate, [], draft.month)[draft.month - 1];
    const ex = monthExercise(candidate, result);
    const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
    return { ex, params, view: buildView(ex, params), max: grade(ex, params, {}).max };
  }, [spec, draft]);
  const upcoming = Array.from({ length: spec.months - openedMonth }, (_, i) => openedMonth + i + 1);

  return (
    <section className="stack-sm" aria-labelledby="month-work-heading">
      <div className="card tint-purple stack">
        <div className="stack-sm">
          <h2 id="month-work-heading">Plan the next month with AI</h2>
          <p>Choose what students should do next. For example, ask for journal entries in February, inventory in March, then financial statements in April.</p>
          <p className="hint">Changes apply to this class only. Current and completed months, company decisions and business results stay fixed.</p>
        </div>
        <form className="stack-sm" onSubmit={async (e) => {
          e.preventDefault();
          setBusy("generate");
          setError(null);
          setSaved(null);
          setDraft(null);
          try {
            const result = await draftMonthWork(runId, month, instruction);
            if (result.ok) { setDraft(result.work); setView("student"); }
            else setError(result.error);
          } catch {
            setError("The draft could not be generated. Please try again.");
          } finally { setBusy(null); }
        }}>
          <label className="field">
            <span className="label">Upcoming month</span>
            <select className="input" value={month} disabled={busy !== null} onChange={(e) => { setMonth(Number(e.target.value)); setDraft(null); setError(null); setSaved(null); }}>
              {upcoming.map((m) => <option key={m} value={m}>{monthLabel(spec, m)} · month {m}</option>)}
            </select>
          </label>
          <p className="hint">Current tasks: {(spec.monthWork.find((w) => w.month === month)?.parts ?? spec.monthParts).map((p) => p.title).join(" · ")}</p>
          <label className="field">
            <span className="label">What should students do?</span>
            <textarea className="textarea" rows={3} maxLength={4000} required disabled={busy !== null} value={instruction}
              onChange={(e) => { setInstruction(e.target.value); setDraft(null); setError(null); setSaved(null); }}
              placeholder="e.g. Replace the journal worksheet with an inventory schedule and two questions about cost of sales. Use this company's real monthly figures." />
          </label>
          <div><button type="submit" className="btn btn-primary" disabled={busy !== null || !instruction.trim()} aria-busy={busy === "generate"}>
            {busy === "generate" ? "Preparing draft…" : "Generate month draft"}
          </button></div>
        </form>
        {error && !draft && <p className="alert warn" role="alert">{error}</p>}
        {saved && <p className="alert ok" role="status">{saved}</p>}
      </div>
      {busy === "generate" && <AiWorking steps={["Reading your request…", "Writing the student tasks…", "Checking the formulas and marks…"]} />}
      {draft && preview && (
        <div className="stack-sm">
          <div className="row-between">
            <div>
              <h3>Draft for {monthLabel(spec, draft.month)}</h3>
              <p className="hint">Not applied yet · {preview.max} available marks · preview uses default decisions; students get their own company figures.</p>
            </div>
            <Tabs<"student" | "key"> label="Month draft preview" value={view} onChange={setView} tabs={[{ value: "student", label: "Student view" }, { value: "key", label: "Answer key" }]} />
          </div>
          <Sheet view={preview.view} answers={view === "key" ? perfectAnswers(preview.ex, preview.params) : {}} />
          {error && <p className="alert warn" role="alert">{error}</p>}
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy !== null} aria-busy={busy === "apply"} onClick={async () => {
              setBusy("apply"); setError(null);
              try {
                const result = await applyMonthWork(runId, draft);
                if (result.ok) {
                  setSaved(`Applied to ${monthLabel(spec, draft.month)}. Students receive these tasks when you open that month.`);
                  setDraft(null);
                  router.refresh();
                } else setError(result.error);
              } catch { setError("The plan could not be applied. Please try again."); }
              finally { setBusy(null); }
            }}>{busy === "apply" ? "Applying…" : `Apply to ${monthLabel(spec, draft.month)}`}</button>
            <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => setDraft(null)}>Discard draft</button>
          </div>
        </div>
      )}
    </section>
  );
}
