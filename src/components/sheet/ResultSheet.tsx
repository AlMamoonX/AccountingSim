"use client";

import type { ExerciseView, GradeResult, StudentAnswers } from "@/lib/spec/engine";
import { Sheet, type PartExpected } from "./Sheet";

/** Marked, read-only sheet: wrong values struck through with the correct value below (when `result` includes them). */
export function ResultSheet({ view, answers, result }: { view: ExerciseView; answers: StudentAnswers; result: GradeResult }) {
  const marks = Object.fromEntries(result.parts.map((p) => [p.partId, p.marks]));
  const hasExpected = result.parts.some((p) => Object.keys(p.expected).length || Object.keys(p.expectedText ?? {}).length || Object.keys(p.expectedLines).length);
  const expected: Record<string, PartExpected> | undefined = hasExpected
    ? Object.fromEntries(result.parts.map((p) => [p.partId, { expected: p.expected, expectedText: p.expectedText, expectedLines: p.expectedLines }]))
    : undefined;
  return (
    <Sheet
      view={view}
      answers={answers}
      marks={marks}
      expected={expected}
      partFooter={(id) => {
        const p = result.parts.find((x) => x.partId === id);
        return p ? (
          <p className="label" style={{ textAlign: "right" }}>
            <span className="mono">
              {p.score}/{p.max}
            </span>{" "}
            marks
          </p>
        ) : null;
      }}
    />
  );
}
