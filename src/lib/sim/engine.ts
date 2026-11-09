import { parse, evaluate, ExprError, type Node } from "@/lib/spec/expr";
import { analyze, buildView, type ExerciseView, type Values } from "@/lib/spec/engine";
import { formatAmount } from "@/lib/spec/format";
import { explainUnknownNames } from "@/lib/spec/nameHints";
import type { ExerciseSpec } from "@/lib/spec/schema";
import type { SimDecision, SimEvent, SimSpec } from "./schema";

/* ------------------------------------------------------------------ */
/* A small lazy evaluator for one month                                */
/* ------------------------------------------------------------------ */

type Def = number | Node;

class Scope {
  private cache = new Map<string, number>();
  private stack: string[] = [];
  constructor(private defs: Map<string, Def>) {}

  has(name: string) {
    return this.defs.has(name);
  }

  value(name: string): number {
    const hit = this.cache.get(name);
    if (hit !== undefined) return hit;
    const def = this.defs.get(name);
    if (def === undefined) throw new ExprError(`Unknown name "${name}"`);
    if (this.stack.includes(name)) throw new ExprError(`Formula loop: ${[...this.stack, name].join(" → ")}`);
    this.stack.push(name);
    try {
      const v = typeof def === "number" ? def : evaluate(def, (n) => this.value(n));
      if (!Number.isFinite(v)) throw new ExprError(`"${name}" is not a finite number`);
      this.cache.set(name, v);
      return v;
    } finally {
      this.stack.pop();
    }
  }

  calc(src: string): number {
    return evaluate(parse(src), (n) => this.value(n));
  }

  text(src: string | undefined): string {
    if (!src) return "";
    return src.replace(/\{\{([^}]+)\}\}/g, (_, e: string) => {
      try {
        return formatAmount(this.calc(e.trim()));
      } catch {
        return `[${e.trim()}?]`;
      }
    });
  }

  all(): Values {
    const out: Values = {};
    for (const k of this.defs.keys()) out[k] = this.value(k);
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export function defaultDecisions(spec: SimSpec): Values {
  return Object.fromEntries(spec.decisions.map((d) => [d.name, d.default]));
}

/** Checks a student's decisions against min/max/step/options. Returns clean numbers or an error message. */
export function validateDecisions(spec: SimSpec, raw: Record<string, unknown>): { ok: true; values: Values } | { ok: false; error: string } {
  const values: Values = {};
  for (const d of spec.decisions) {
    const v = Number(raw[d.name]);
    if (!Number.isFinite(v)) return { ok: false, error: `Choose a value for “${d.label}”.` };
    const bad = decisionProblem(d, v);
    if (bad) return { ok: false, error: bad };
    values[d.name] = v;
  }
  return { ok: true, values };
}

function decisionProblem(d: SimDecision, v: number): string | null {
  if (d.kind === "toggle") return v === 0 || v === 1 ? null : `“${d.label}” must be yes or no.`;
  if (d.kind === "choice") return d.options!.some((o) => Math.abs(o.value - v) < 1e-9) ? null : `Pick one of the options for “${d.label}”.`;
  if (v < d.min! - 1e-9 || v > d.max! + 1e-9) return `“${d.label}” must be between ${formatAmount(d.min!)} and ${formatAmount(d.max!)}.`;
  if (d.step) {
    const k = (v - d.min!) / d.step;
    if (Math.abs(k - Math.round(k)) > 1e-6) return `“${d.label}” must go up in steps of ${formatAmount(d.step)}.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* One month                                                           */
/* ------------------------------------------------------------------ */

export interface MonthResult {
  month: number;
  label: string;
  decisions: Values;
  opening: Values;
  closing: Values;
  /** Every name of the month (constants, decisions, events, derived, X and X_end). */
  values: Values;
  event: { title: string; text: string } | null;
  feedback: string[];
  metrics: number[];
}

export function monthLabel(spec: SimSpec, month: number) {
  return spec.monthLabels[month - 1] || `Month ${month}`;
}

function constantDefs(spec: SimSpec, month: number) {
  const defs = new Map<string, Def>();
  for (const c of spec.constants) defs.set(c.name, c.value);
  defs.set("month", month);
  return defs;
}

/** Opening state for month 1, from the `opening` formulas (constants only). */
export function initialState(spec: SimSpec): Values {
  const scope = new Scope(constantDefs(spec, 1));
  return Object.fromEntries(spec.state.map((s) => [s.name, scope.calc(s.opening)]));
}

export function eventFor(spec: SimSpec, month: number): SimEvent | undefined {
  return spec.events.find((e) => e.month === month);
}

function monthScope(spec: SimSpec, month: number, decisions: Values, opening: Values) {
  const defs = constantDefs(spec, month);
  for (const d of spec.decisions) defs.set(d.name, decisions[d.name] ?? d.default);
  const ev = eventFor(spec, month);
  for (const v of spec.eventVars) {
    const set = ev?.set[v.name];
    defs.set(v.name, set !== undefined ? parse(set) : v.default);
  }
  for (const s of spec.state) {
    defs.set(s.name, opening[s.name] ?? 0);
    defs.set(`${s.name}_end`, parse(s.closing));
  }
  for (const d of spec.derived) defs.set(d.name, parse(d.expr));
  return new Scope(defs);
}

export function simulateMonth(spec: SimSpec, month: number, decisions: Values, opening: Values): MonthResult {
  const scope = monthScope(spec, month, decisions, opening);
  const values = scope.all();
  const closing = Object.fromEntries(spec.state.map((s) => [s.name, values[`${s.name}_end`]]));
  const ev = eventFor(spec, month);
  return {
    month,
    label: monthLabel(spec, month),
    decisions: Object.fromEntries(spec.decisions.map((d) => [d.name, values[d.name]])),
    opening: { ...opening },
    closing,
    values,
    event: ev ? { title: ev.title, text: scope.text(ev.text) } : null,
    feedback: spec.feedback.filter((f) => scope.calc(f.when) !== 0).map((f) => scope.text(f.text)),
    metrics: spec.metrics.map((m) => scope.calc(m.expr)),
  };
}

/**
 * Runs the company from month 1. Each month opens on the previous month's TRUE closing books,
 * so a student's bookkeeping mistakes never carry over. Missing decisions = defaults (auto-play).
 */
export function runCompany(spec: SimSpec, decisionsByMonth: (Values | null | undefined)[], upTo = decisionsByMonth.length): MonthResult[] {
  const out: MonthResult[] = [];
  let opening = initialState(spec);
  for (let m = 1; m <= Math.min(upTo, spec.months); m++) {
    const r = simulateMonth(spec, m, decisionsByMonth[m - 1] ?? defaultDecisions(spec), opening);
    out.push(r);
    opening = r.closing;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The month's books as a normal exercise (reuses marking + Sheet)     */
/* ------------------------------------------------------------------ */

export function monthExercise(spec: SimSpec, r: MonthResult): ExerciseSpec {
  const work = spec.monthWork.find((w) => w.month === r.month);
  return {
    version: 1,
    title: work?.title ?? `${spec.business.name} · ${r.label}`,
    business: spec.business,
    currency: spec.currency,
    period: r.label,
    story: [work ? `${work.title}\n${work.instructions}` : "", r.event ? `${r.event.title}: ${r.event.text}` : ""].filter(Boolean).join("\n\n"),
    params: Object.entries(r.values).map(([name, value]) => ({ name, value })),
    transactions: work?.transactions ?? spec.monthTransactions,
    parts: work?.parts ?? spec.monthParts,
    checks: [],
    outOfCourse: [],
  };
}

/** The statements with every cell shown (results screen). */
export function statementsView(spec: SimSpec, r: MonthResult): ExerciseView | null {
  if (!spec.statements.length) return null;
  const parts = spec.statements.map((p) => ({
    ...p,
    totals: false,
    rows: p.rows.map((row) => ({
      ...row,
      cells: Object.fromEntries(Object.entries(row.cells).map(([k, c]) => [k, { given: "answer" in c ? c.answer : c.given }])),
    })),
  }));
  const ex: ExerciseSpec = { ...monthExercise(spec, r), transactions: [], story: "", parts };
  return buildView(ex, Object.fromEntries(Object.entries(r.values)));
}

/* ------------------------------------------------------------------ */
/* Scores                                                              */
/* ------------------------------------------------------------------ */

/** Score names: last month's values + total_X (derived sums) + min_X_end / max_X_end (state over months). */
export function businessScore(spec: SimSpec, results: MonthResult[]): { raw: number; pct: number } {
  if (!results.length) return { raw: 0, pct: 0 };
  const last = results[results.length - 1];
  const defs = new Map<string, Def>(Object.entries(last.values));
  for (const d of spec.derived) defs.set(`total_${d.name}`, results.reduce((s, r) => s + r.values[d.name], 0));
  for (const s of spec.state) {
    const ends = results.map((r) => r.closing[s.name]);
    defs.set(`min_${s.name}_end`, Math.min(...ends));
    defs.set(`max_${s.name}_end`, Math.max(...ends));
  }
  const raw = new Scope(defs).calc(spec.score.expr);
  const span = spec.score.excellent - spec.score.poor;
  const pct = span === 0 ? (raw >= spec.score.excellent ? 1 : 0) : Math.max(0, Math.min(1, (raw - spec.score.poor) / span));
  return { raw, pct };
}

/** Final mark out of 100. accountingWeight is 0..100. */
export function finalMark(accScore: number, accMax: number, businessPct: number, accountingWeight: number) {
  const acc = accMax > 0 ? accScore / accMax : 0;
  const w = Math.max(0, Math.min(100, accountingWeight)) / 100;
  return Math.round((w * acc + (1 - w) * businessPct) * 1000) / 10;
}

/* ------------------------------------------------------------------ */
/* Validation (AI repair loop + doctor edits)                          */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomDecisions(spec: SimSpec, rnd: () => number): Values {
  return Object.fromEntries(
    spec.decisions.map((d) => {
      if (d.kind === "toggle") return [d.name, rnd() < 0.5 ? 0 : 1];
      if (d.kind === "choice") return [d.name, d.options![Math.floor(rnd() * d.options!.length)].value];
      const step = d.step ?? ((d.max! - d.min!) / 20 || 1);
      const n = Math.floor((d.max! - d.min!) / step);
      return [d.name, Math.round((d.min! + step * Math.floor(rnd() * (n + 1))) * 1e6) / 1e6];
    }),
  );
}

export interface SimAnalysis {
  errors: string[];
  failed: string[];
  ok: boolean;
}

export function simStructureIssues(spec: SimSpec): string[] {
  const issues: string[] = [];
  const seen = new Set<string>(["month"]);
  const add = (name: string, what: string) => {
    if (seen.has(name)) issues.push(`The name "${name}" (${what}) is used twice`);
    seen.add(name);
  };
  spec.constants.forEach((c) => add(c.name, "constant"));
  spec.decisions.forEach((d) => add(d.name, "decision"));
  spec.eventVars.forEach((v) => add(v.name, "event variable"));
  spec.state.forEach((s) => {
    add(s.name, "state");
    add(`${s.name}_end`, "state closing");
  });
  spec.derived.forEach((d) => add(d.name, "derived"));
  spec.monthParts.forEach((p) => add(p.id, "part id"));
  const workMonths = new Set<number>();
  for (const work of spec.monthWork) {
    if (workMonths.has(work.month)) issues.push(`Month ${work.month} has more than one coursework plan`);
    workMonths.add(work.month);
    if (work.month > spec.months) issues.push(`Coursework month ${work.month} is beyond the simulation`);
  }
  for (const d of spec.decisions) {
    const bad = decisionProblem(d, d.default);
    if (bad) issues.push(`Default of ${bad}`);
  }
  for (const e of spec.events) {
    if (e.month > spec.months) issues.push(`Event "${e.title}" is in month ${e.month} but the sim has ${spec.months} months`);
    for (const k of Object.keys(e.set)) if (!spec.eventVars.some((v) => v.name === k)) issues.push(`Event "${e.title}" sets unknown event variable "${k}"`);
  }
  if (spec.score.excellent === spec.score.poor) issues.push("Score: excellent and poor must be different");
  return issues;
}

/**
 * Plays the whole game with the default decisions and with `samples` random decision sets.
 * Every formula must work, every check must hold, and every month's books must be markable.
 */
export function analyzeSim(spec: SimSpec, samples = 20): SimAnalysis {
  const errors = simStructureIssues(spec);
  if (errors.length) return { errors, failed: [], ok: false };
  const failed: string[] = [];
  const rnd = mulberry32(12345);
  const plays: { name: string; decisions: Values[] }[] = [
    { name: "default decisions", decisions: Array.from({ length: spec.months }, () => defaultDecisions(spec)) },
  ];
  for (let i = 0; i < samples; i++) plays.push({ name: `random play ${i + 1}`, decisions: Array.from({ length: spec.months }, () => randomDecisions(spec, rnd)) });

  for (const play of plays) {
    let results: MonthResult[];
    try {
      results = runCompany(spec, play.decisions, spec.months);
    } catch (e) {
      errors.push(`${play.name}: ${(e as Error).message}`);
      break;
    }
    for (const r of results) {
      const scope = monthScope(spec, r.month, r.decisions, r.opening);
      for (const c of spec.checks) {
        let ok = false;
        try {
          ok = scope.calc(c.expr) !== 0;
        } catch (e) {
          errors.push(`Check "${c.label}": ${(e as Error).message}`);
          continue;
        }
        if (!ok && failed.length < 8) failed.push(`${c.label} – fails in ${r.label} (${play.name}: ${describeDecisions(spec, r.decisions)})`);
      }
      {
        const a = analyze(monthExercise(spec, r));
        a.errors.forEach((e) => errors.push(`${r.label} books: ${e}`));
        a.checks.filter((c) => !c.ok).forEach((c) => failed.length < 8 && failed.push(`${r.label} books (${play.name}): ${c.label}`));
        try {
          const ex = monthExercise(spec, r);
          const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
          if (buildView(ex, params).parts.length === 0) errors.push(`${r.label}: no student tasks are visible for ${play.name}`);
        } catch (e) {
          errors.push(`${r.label} tasks: ${(e as Error).message}`);
        }
      }
    }
    if (play === plays[0]) {
      try {
        businessScore(spec, results);
      } catch (e) {
        errors.push(`Score formula: ${(e as Error).message}`);
      }
      const sv = results[0] && spec.statements.length ? analyze({ ...monthExercise(spec, results[0]), transactions: [], parts: spec.statements }) : null;
      sv?.errors.forEach((e) => errors.push(`Statements: ${e}`));
    }
    if (errors.length > 12) break;
  }
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    errors: explainUnknownNames(uniq(errors).slice(0, 20), simNameContext(spec)),
    failed: uniq(failed),
    ok: errors.length === 0 && failed.length === 0,
  };
}

/** Names a sim formula may use, plus every journal part (for account-id hints). */
export function simNameContext(spec: SimSpec) {
  const known = [
    "month",
    ...spec.constants.map((c) => c.name),
    ...spec.decisions.map((d) => d.name),
    ...spec.eventVars.map((v) => v.name),
    ...spec.state.flatMap((s) => [s.name, `${s.name}_end`]),
    ...spec.derived.map((d) => d.name),
  ];
  return { known, parts: [...spec.monthParts, ...spec.monthWork.flatMap((w) => w.parts), ...spec.statements] };
}

function describeDecisions(spec: SimSpec, v: Values) {
  return spec.decisions.map((d) => `${d.name}=${formatAmount(v[d.name])}`).join(", ");
}
