import type { SimMonthWork, SimSpec } from "./schema";

/** Run-specific plans replace only the corresponding month's coursework. */
export function withMonthWork(spec: SimSpec, changes: SimMonthWork[]): SimSpec {
  const plans = new Map(spec.monthWork.map((work) => [work.month, work]));
  for (const work of changes) plans.set(work.month, work);
  return { ...spec, monthWork: [...plans.values()].sort((a, b) => a.month - b.month) };
}

export function monthWorkIssue(run: { openedMonth: number; deadline: Date; endedAt: Date | null }, months: number, month: number, now = new Date()): string | null {
  if (run.endedAt || now >= run.deadline) return "This simulation has ended.";
  if (!Number.isInteger(month) || month < 1 || month > months) return "Choose a month in this simulation.";
  if (month <= run.openedMonth) return "That month is already open. Choose an upcoming month; current and completed work is locked.";
  return null;
}
