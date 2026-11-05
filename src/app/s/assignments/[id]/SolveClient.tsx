"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExerciseView, Mark, StudentAnswers, GridAnswers, JournalAnswers, NumericAnswers } from "@/lib/spec/engine";
import { Sheet } from "@/components/sheet/Sheet";
import { Badge } from "@/components/ui/bits";
import { ConfirmButton } from "@/components/ui/client";
import { checkPart, handIn, saveAnswers } from "@/app/actions/student";

type SaveState = "idle" | "saving" | "saved" | "error";

function timeLeft(ms: number) {
  if (ms <= 0) return "Deadline passed";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m % 60}m left`;
  return `${m}m left`;
}

export function SolveClient({
  assignmentId,
  view,
  initialAnswers,
  mode,
  deadline,
  closed: closedAtLoad,
}: {
  assignmentId: string;
  view: ExerciseView;
  initialAnswers: StudentAnswers;
  mode: "practice" | "graded";
  deadline: string;
  closed: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<StudentAnswers>(initialAnswers);
  const [marks, setMarks] = useState<Record<string, Record<string, Mark>>>({});
  const [scores, setScores] = useState<Record<string, { score: number; max: number }>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(answers);
  const deadlineMs = new Date(deadline).getTime();
  const closed = closedAtLoad || now > deadlineMs;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSave("saving");
    const r = await saveAnswers(assignmentId, latest.current).catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection." }));
    if (r.ok) setSave("saved");
    else {
      setSave("error");
      setError(r.error);
    }
  }, [assignmentId]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const onChange = (partId: string, value: GridAnswers | JournalAnswers | NumericAnswers) => {
    const next = { ...latest.current, [partId]: value };
    latest.current = next;
    setAnswers(next);
    // Typing clears that part's marks.
    if (marks[partId]) {
      setMarks(({ [partId]: _, ...rest }) => rest);
      setScores(({ [partId]: _, ...rest }) => rest);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };

  async function check(partId: string) {
    setChecking(partId);
    setError(null);
    const r = await checkPart(assignmentId, partId, latest.current);
    setChecking(null);
    if (r.ok) {
      setMarks((m) => ({ ...m, [partId]: r.marks }));
      setScores((s) => ({ ...s, [partId]: { score: r.score, max: r.max } }));
    } else setError(r.error);
  }

  async function submit() {
    if (timer.current) clearTimeout(timer.current);
    const r = await handIn(assignmentId, latest.current);
    if (r.ok) router.push(`/s/assignments/${assignmentId}/result`);
    else setError(r.error);
  }

  return (
    <div className="stack">
      <div className="row-between rise" style={{ marginTop: 24 }}>
        <div className="stack-sm" style={{ gap: 6 }}>
          <h1 style={{ margin: 0 }}>{view.title}</h1>
          <div className="row">
            <Badge kind={mode === "practice" ? "practice" : "graded"}>{mode === "practice" ? "Practice" : "Graded"}</Badge>
            <Badge kind={closed ? "error" : "plain"}>{timeLeft(deadlineMs - now)}</Badge>
            <span className="saving" aria-live="polite">
              <span key={save} className="fade-swap" style={{ display: "inline-block" }}>
                {save === "saving" && "Saving…"}
                {save === "saved" && <span style={{ color: "var(--tx-teal)" }}>✓ Saved</span>}
                {save === "error" && <span style={{ color: "var(--tx-orange)" }}>Not saved</span>}
              </span>
            </span>
          </div>
        </div>
      </div>

      {closed && (
        <p className="alert warn" role="alert">
          The deadline has passed. This can&apos;t be handed in any more.
        </p>
      )}

      <Sheet
        view={view}
        answers={answers}
        onChange={closed ? undefined : onChange}
        marks={marks}
        partFooter={(partId) =>
          mode === "practice" && !closed ? (
            <div className="row-between">
              <span className="label" aria-live="polite">
                {scores[partId] && (
                  <span className="fade-swap" style={{ display: "inline-block" }}>
                    <span className="mono">
                      {scores[partId].score}/{scores[partId].max}
                    </span>{" "}
                    marks so far
                  </span>
                )}
              </span>
              <button className="btn btn-secondary" type="button" onClick={() => check(partId)} disabled={checking !== null}>
                {checking === partId ? "Checking…" : "Check"}
              </button>
            </div>
          ) : null
        }
      />

      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}
      <div className="card ink row-between">
        <div>
          <p className="card-title">Ready?</p>
          <p className="muted">{mode === "graded" ? "Marks show after the deadline." : "You'll see your marks right after handing in."}</p>
        </div>
        <ConfirmButton
          className="btn btn-special"
          label="Hand in"
          question="Hand in now? You can't change your answers after this."
          confirmLabel="Hand in"
          onConfirm={submit}
          disabled={closed}
        />
      </div>
    </div>
  );
}
