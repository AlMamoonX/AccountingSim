import { parse, evaluate, ExprError, type Node } from "./expr";
import type { ExerciseSpec, GridPart, JournalPart, NumericPart, Part, Check } from "./schema";
import { formatAmount, parseAmount } from "./format";
import { normalizeTerm, textAnswer } from "./questions";

export { formatAmount, parseAmount };

/* ------------------------------------------------------------------ */
/* Model: every value in an exercise is a named formula                */
/* ------------------------------------------------------------------ */

export type Values = Record<string, number>;

type Def = { node: Node; scope?: string } | { fn: () => number };

export const CELL_TOLERANCE = 0.01;

export class Model {
  private defs = new Map<string, Def>();
  private cache = new Map<string, number>();
  private stack: string[] = [];
  private parsed = new Map<string, Node>();

  constructor(
    public spec: ExerciseSpec,
    public params: Values,
  ) {
    this.build();
  }

  private node(src: string): Node {
    let n = this.parsed.get(src);
    if (!n) {
      n = parse(src);
      this.parsed.set(src, n);
    }
    return n;
  }

  private define(name: string, def: Def) {
    this.defs.set(name, def);
  }

  private build() {
    const { spec } = this;
    for (const p of spec.params) {
      const v = this.params[p.name] ?? p.value;
      this.define(p.name, { fn: () => v });
    }
    for (const part of spec.parts) {
      if (part.type === "grid") this.buildGrid(part);
      else if (part.type === "journal") this.buildJournal(part);
      else this.buildNumeric(part);
    }
  }

  private buildGrid(part: GridPart) {
    const P = part.id;
    const entryRows = part.rows.filter((r) => r.kind === "entry");
    for (const row of part.rows) {
      if (row.kind === "heading") continue;
      for (const col of part.columns) {
        const cell = row.cells[col.id];
        const name = `${P}.${row.id}.${col.id}`;
        if (!cell) this.define(name, { fn: () => 0 });
        else this.define(name, { node: this.node("answer" in cell ? cell.answer : cell.given), scope: P });
      }
    }
    for (const col of part.columns) {
      this.define(`${P}.total.${col.id}`, {
        fn: () => entryRows.reduce((s, r) => s + this.value(`${P}.${r.id}.${col.id}`), 0),
      });
    }
    const groupIds = new Set([...part.groups.map((g) => g.id), ...part.columns.map((c) => c.group).filter(Boolean)]);
    for (const g of groupIds) {
      const cols = part.columns.filter((c) => c.group === g);
      this.define(`${P}.group.${g}`, {
        fn: () => cols.reduce((s, c) => s + this.value(`${P}.total.${c.id}`), 0),
      });
    }
  }

  private buildJournal(part: JournalPart) {
    const P = part.id;
    const debitParts = new Map<string, string[]>();
    const creditParts = new Map<string, string[]>();
    for (const a of part.accounts) {
      debitParts.set(a.id, []);
      creditParts.set(a.id, []);
    }
    for (const e of part.entries) {
      e.lines.forEach((l, i) => {
        const name = `${P}.${e.id}.line${i + 1}`;
        const src = (l.debit ?? l.credit)!;
        this.define(name, { node: this.node(src), scope: P });
        (l.debit !== undefined ? debitParts : creditParts).get(l.account)?.push(name);
      });
    }
    for (const a of part.accounts) {
      const d = debitParts.get(a.id)!;
      const c = creditParts.get(a.id)!;
      this.define(`${P}.debit.${a.id}`, { fn: () => d.reduce((s, n) => s + this.value(n), 0) });
      this.define(`${P}.credit.${a.id}`, { fn: () => c.reduce((s, n) => s + this.value(n), 0) });
      this.define(`${P}.balance.${a.id}`, {
        fn: () => this.value(`${P}.debit.${a.id}`) - this.value(`${P}.credit.${a.id}`),
      });
    }
  }

  private buildNumeric(part: NumericPart) {
    for (const q of part.questions) {
      if (textAnswer(q) !== undefined) continue;
      this.define(`${part.id}.${q.id}`, { node: this.node(q.answer), scope: part.id });
    }
  }

  has(name: string) {
    return this.defs.has(name);
  }

  resolveName(name: string, scope?: string): string {
    if (this.defs.has(name)) return name;
    if (scope && this.defs.has(`${scope}.${name}`)) return `${scope}.${name}`;
    throw new ExprError(`Unknown name "${name}"`);
  }

  value(name: string): number {
    const hit = this.cache.get(name);
    if (hit !== undefined) return hit;
    const def = this.defs.get(name);
    if (!def) throw new ExprError(`Unknown name "${name}"`);
    if (this.stack.includes(name)) {
      throw new ExprError(`Formula loop: ${[...this.stack, name].join(" → ")}`);
    }
    this.stack.push(name);
    try {
      const v = "fn" in def ? def.fn() : evaluate(def.node, (n) => this.value(this.resolveName(n, def.scope)));
      if (!Number.isFinite(v)) throw new ExprError(`"${name}" is not a finite number`);
      this.cache.set(name, v);
      return v;
    } finally {
      this.stack.pop();
    }
  }

  /** Evaluate a formula with the safe parser in expr.ts (not JavaScript eval). */
  calc(src: string, scope?: string): number {
    return evaluate(this.node(src), (n) => this.value(this.resolveName(n, scope)));
  }

  /** Replace {{formula}} in text with formatted numbers. */
  text(src: string | undefined, scope?: string): string {
    if (!src) return "";
    return src.replace(/\{\{([^}]+)\}\}/g, (_, e: string) => {
      try {
        return formatAmount(this.calc(e.trim(), scope));
      } catch {
        return `[${e.trim()}?]`;
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

const close = (a: number, b: number, tol = CELL_TOLERANCE) => Math.abs(a - b) <= tol;
const isZero = (n: number) => Math.abs(n) <= CELL_TOLERANCE;

/* ------------------------------------------------------------------ */
/* Structure checks and analysis (used after AI generation and edits)  */
/* ------------------------------------------------------------------ */

export function allChecks(spec: ExerciseSpec): { check: Check; scope?: string; where: string }[] {
  const out: { check: Check; scope?: string; where: string }[] = [];
  for (const part of spec.parts) {
    for (const c of part.checks) out.push({ check: c, scope: part.id, where: part.title });
  }
  for (const c of spec.checks) out.push({ check: c, where: "Exercise" });
  return out;
}

export function structuralIssues(spec: ExerciseSpec): string[] {
  const issues: string[] = [];
  const top = new Set<string>();
  const dup = (set: Set<string>, id: string, what: string) => {
    if (set.has(id)) issues.push(`Duplicate ${what} id "${id}"`);
    set.add(id);
  };
  spec.params.forEach((p) => {
    dup(top, p.name, "amount/part");
    if (p.min !== undefined && p.max !== undefined && p.min > p.max) issues.push(`Amount "${p.name}": min is above max`);
    if (p.min !== undefined && p.value < p.min) issues.push(`Amount "${p.name}": value is below its min`);
    if (p.max !== undefined && p.value > p.max) issues.push(`Amount "${p.name}": value is above its max`);
  });
  spec.parts.forEach((p) => dup(top, p.id, "amount/part"));
  const tx = new Set<string>();
  spec.transactions.forEach((t) => dup(tx, t.id, "transaction"));

  for (const part of spec.parts) {
    if (part.type === "grid") {
      const cols = new Set<string>();
      part.columns.forEach((c) => dup(cols, c.id, `column (${part.title})`));
      const groups = new Set(part.groups.map((g) => g.id));
      part.columns.forEach((c) => {
        if (c.group && part.groups.length && !groups.has(c.group))
          issues.push(`${part.title}: column "${c.label}" uses unknown group "${c.group}"`);
      });
      const rows = new Set<string>();
      part.rows.forEach((r) => {
        dup(rows, r.id, `row (${part.title})`);
        if (r.id === "total" || r.id === "group") issues.push(`${part.title}: row id "${r.id}" is reserved`);
        for (const key of Object.keys(r.cells)) {
          if (!cols.has(key)) issues.push(`${part.title}, row "${r.label}": unknown column "${key}"`);
        }
      });
    } else if (part.type === "journal") {
      const acc = new Set<string>();
      part.accounts.forEach((a) => dup(acc, a.id, `account (${part.title})`));
      for (const k of ["debit", "credit", "balance"]) if (acc.has(k)) issues.push(`${part.title}: account id "${k}" is reserved`);
      const ents = new Set<string>();
      part.entries.forEach((e) => {
        dup(ents, e.id, `entry (${part.title})`);
        e.lines.forEach((l) => {
          if (!acc.has(l.account)) issues.push(`${part.title}, entry "${e.label ?? e.id}": unknown account "${l.account}"`);
        });
      });
    } else {
      const qs = new Set<string>();
      part.questions.forEach((q) => dup(qs, q.id, `question (${part.title})`));
    }
  }
  return issues;
}

export interface CheckResult {
  label: string;
  where: string;
  ok: boolean;
  error?: string;
}

export interface Analysis {
  errors: string[];
  checks: CheckResult[];
  ok: boolean;
}

/** Evaluate every formula and every check with the given amounts. */
export function analyze(spec: ExerciseSpec, params: Values = defaultParams(spec)): Analysis {
  const errors = structuralIssues(spec);
  if (errors.length) return { errors, checks: [], ok: false };
  let model: Model;
  try {
    model = new Model(spec, params);
  } catch (e) {
    return { errors: [(e as Error).message], checks: [], ok: false };
  }
  const tryVal = (fn: () => unknown, where: string) => {
    try {
      fn();
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
  };
  for (const part of spec.parts) {
    if (part.type === "grid") {
      for (const r of part.rows) {
        if (r.kind === "heading") continue;
        for (const c of part.columns) tryVal(() => model.value(`${part.id}.${r.id}.${c.id}`), `${part.title}, row "${r.label}", ${c.label}`);
      }
      for (const c of part.columns) tryVal(() => model.value(`${part.id}.total.${c.id}`), `${part.title}, total ${c.label}`);
    } else if (part.type === "journal") {
      for (const a of part.accounts) tryVal(() => model.value(`${part.id}.balance.${a.id}`), `${part.title}, ${a.label}`);
    } else {
      for (const q of part.questions) if (textAnswer(q) === undefined) tryVal(() => model.value(`${part.id}.${q.id}`), `${part.title}, "${q.prompt.slice(0, 40)}"`);
    }
  }
  for (const w of whenFormulas(spec)) tryVal(() => model.calc(w.expr, w.scope), w.where);
  for (const t of spec.transactions) checkText(model, t.text, undefined, `Transaction ${t.id}`, errors);
  checkText(model, spec.story, undefined, "Story", errors);
  for (const part of spec.parts) {
    if (part.type === "grid") part.rows.forEach((r) => checkText(model, r.label, part.id, `${part.title} row label`, errors));
    if (part.type === "journal") part.entries.forEach((e) => checkText(model, e.description, part.id, `${part.title} entry`, errors));
    if (part.type === "numeric") part.questions.forEach((q) => checkText(model, q.prompt, part.id, `${part.title} question`, errors));
  }

  const checks: CheckResult[] = allChecks(spec).map(({ check, scope, where }) => {
    try {
      return { label: check.label, where, ok: model.calc(check.expr, scope) !== 0 };
    } catch (e) {
      return { label: check.label, where, ok: false, error: (e as Error).message };
    }
  });
  return { errors, checks, ok: errors.length === 0 && checks.every((c) => c.ok) };
}

function checkText(model: Model, text: string | undefined, scope: string | undefined, where: string, errors: string[]) {
  if (!text) return;
  for (const m of text.matchAll(/\{\{([^}]+)\}\}/g)) {
    try {
      model.calc(m[1].trim(), scope);
    } catch (e) {
      errors.push(`${where}: {{${m[1].trim()}}}: ${(e as Error).message}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Conditions: items with a `when` formula that is 0 are left out      */
/* ------------------------------------------------------------------ */

/** Leaves out rows, entries, questions and transactions whose `when` formula is 0 for these amounts. */
export function effectiveSpec(spec: ExerciseSpec, params: Values): ExerciseSpec {
  if (!JSON.stringify(spec).includes('"when"')) return spec;
  const m = new Model(spec, params);
  const keep = (w: string | undefined, scope?: string) => {
    if (!w) return true;
    try {
      return m.calc(w, scope) !== 0;
    } catch {
      return true;
    }
  };
  const parts = spec.parts
    .map((p): Part => {
      if (p.type === "grid") return { ...p, rows: p.rows.filter((r) => keep(r.when, p.id)) };
      if (p.type === "journal") return { ...p, entries: p.entries.filter((e) => keep(e.when, p.id)) };
      return { ...p, questions: p.questions.filter((q) => keep(q.when, p.id)) };
    })
    .filter((p) => (p.type === "grid" ? p.rows.some((r) => r.kind !== "heading") : p.type === "journal" ? p.entries.length > 0 : p.questions.length > 0));
  return { ...spec, transactions: spec.transactions.filter((t) => keep(t.when)), parts };
}

function whenFormulas(spec: ExerciseSpec): { expr: string; scope?: string; where: string }[] {
  const out: { expr: string; scope?: string; where: string }[] = [];
  spec.transactions.forEach((t) => t.when && out.push({ expr: t.when, where: `Transaction ${t.id} condition` }));
  for (const p of spec.parts) {
    if (p.type === "grid") p.rows.forEach((r) => r.when && out.push({ expr: r.when, scope: p.id, where: `${p.title}, row "${r.label}" condition` }));
    if (p.type === "journal") p.entries.forEach((e) => e.when && out.push({ expr: e.when, scope: p.id, where: `${p.title}, entry ${e.label ?? e.id} condition` }));
    if (p.type === "numeric") p.questions.forEach((q) => q.when && out.push({ expr: q.when, scope: p.id, where: `${p.title}, question condition` }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Variants: different amounts per student                             */
/* ------------------------------------------------------------------ */

export function defaultParams(spec: ExerciseSpec): Values {
  return Object.fromEntries(spec.params.map((p) => [p.name, p.value]));
}

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

/**
 * Seed 0 = the exercise's own amounts (same for everyone).
 * Other seeds = random amounts within each amount's min/max/step that still pass every check.
 */
export function paramsForSeed(spec: ExerciseSpec, seed: number): Values {
  const defaults = defaultParams(spec);
  if (!seed) return defaults;
  const ranged = spec.params.filter((p) => p.min !== undefined && p.max !== undefined);
  if (!ranged.length) return defaults;
  const rnd = mulberry32(seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    const vals: Values = { ...defaults };
    for (const p of ranged) {
      const step = p.step ?? 1;
      const n = Math.floor((p.max! - p.min!) / step);
      vals[p.name] = Math.round((p.min! + step * Math.floor(rnd() * (n + 1))) * 1e6) / 1e6;
    }
    const a = analyze(spec, vals);
    if (a.ok) return vals;
  }
  return defaults;
}

/* ------------------------------------------------------------------ */
/* What students see (never contains answers)                          */
/* ------------------------------------------------------------------ */

export type GridCellView = { given: number } | { input: true } | null;

export interface GridView {
  id: string;
  type: "grid";
  title: string;
  instructions: string;
  groups: { id: string; label: string; span: number }[];
  columns: { id: string; label: string; group?: string }[];
  rows: { id: string; label: string; kind: "entry" | "total" | "heading"; cells: Record<string, GridCellView> }[];
  totals: boolean;
  totalsLabel: string;
  rowHeader: string;
}
export interface JournalView {
  id: string;
  type: "journal";
  title: string;
  instructions: string;
  accounts: { id: string; label: string }[];
  entries: { id: string; label: string; description: string }[];
}
export interface NumericView {
  id: string;
  type: "numeric";
  title: string;
  instructions: string;
  questions: { id: string; prompt: string; unit?: string; inputKind?: "text" }[];
}
export type PartView = GridView | JournalView | NumericView;

export interface ExerciseView {
  title: string;
  business: { name: string; description?: string };
  currency: string;
  period?: string;
  story: string;
  transactions: { id: string; n: number; text: string }[];
  parts: PartView[];
}

export function buildView(spec: ExerciseSpec, params: Values): ExerciseView {
  spec = effectiveSpec(spec, params);
  const m = new Model(spec, params);
  return {
    title: spec.title,
    business: spec.business,
    currency: spec.currency,
    period: spec.period,
    story: m.text(spec.story),
    transactions: spec.transactions.map((t, i) => ({ id: t.id, n: i + 1, text: m.text(t.text) })),
    parts: spec.parts.map((p) => partView(m, p)),
  };
}

function partView(m: Model, part: Part): PartView {
  if (part.type === "grid") {
    const groups: GridView["groups"] = [];
    for (const c of part.columns) {
      const last = groups[groups.length - 1];
      const gid = c.group ?? "";
      if (last && last.id === gid) last.span++;
      else groups.push({ id: gid, label: part.groups.find((g) => g.id === gid)?.label ?? gid, span: 1 });
    }
    return {
      id: part.id,
      type: "grid",
      title: part.title,
      instructions: m.text(part.instructions, part.id),
      groups: groups.some((g) => g.id) ? groups : [],
      columns: part.columns,
      rows: part.rows.map((r) => ({
        id: r.id,
        label: m.text(r.label, part.id),
        kind: r.kind,
        cells: Object.fromEntries(
          part.columns.map((c) => {
            if (r.kind === "heading") return [c.id, null];
            const cell = r.cells[c.id];
            if (cell && "given" in cell) return [c.id, { given: m.value(`${part.id}.${r.id}.${c.id}`) }];
            return [c.id, { input: true as const }];
          }),
        ),
      })),
      totals: part.totals,
      totalsLabel: part.totalsLabel ?? "Totals",
      rowHeader: part.rowHeader ?? "",
    };
  }
  if (part.type === "journal") {
    return {
      id: part.id,
      type: "journal",
      title: part.title,
      instructions: m.text(part.instructions, part.id),
      accounts: part.accounts,
      entries: part.entries.map((e, i) => ({ id: e.id, label: e.label ?? String(i + 1), description: m.text(e.description, part.id) })),
    };
  }
  return {
    id: part.id,
    type: "numeric",
    title: part.title,
    instructions: m.text(part.instructions, part.id),
    questions: part.questions.map((q) => ({ id: q.id, prompt: m.text(q.prompt, part.id), unit: q.unit, inputKind: textAnswer(q) !== undefined ? "text" : undefined })),
  };
}

/* ------------------------------------------------------------------ */
/* Answers and marking (server only)                                   */
/* ------------------------------------------------------------------ */

export interface GridAnswers {
  cells?: Record<string, string>; // "rowId.colId" -> typed text
  totals?: Record<string, string>; // colId -> typed text
}
export interface JournalLineAnswer {
  account: string;
  debit: string;
  credit: string;
}
export interface JournalAnswers {
  entries?: Record<string, JournalLineAnswer[]>;
}
export interface NumericAnswers {
  values?: Record<string, string>;
}
export type StudentAnswers = Record<string, GridAnswers | JournalAnswers | NumericAnswers>;

export type Mark = "right" | "wrong";

export interface PartResult {
  partId: string;
  title: string;
  score: number;
  max: number;
  /** grid: "row.col" / "total.col"; journal: "entry.lineIndex" and "entry" (whole entry); numeric: question id */
  marks: Record<string, Mark>;
  /** Correct values, only sent to the browser once results are released. */
  expected: Record<string, number>;
  expectedText?: Record<string, string>;
  expectedLines: Record<string, { account: string; side: "debit" | "credit"; amount: number }[]>;
  /** Answer boxes that count, for progress. */
  boxes: number;
  filled: number;
}

export interface GradeResult {
  score: number;
  max: number;
  parts: PartResult[];
  progress: number; // 0..1
}

export function grade(spec: ExerciseSpec, params: Values, answers: StudentAnswers): GradeResult {
  spec = effectiveSpec(spec, params);
  const m = new Model(spec, params);
  const parts = spec.parts.map((p) => {
    const a = (answers?.[p.id] ?? {}) as never;
    if (p.type === "grid") return gradeGrid(m, p, a);
    if (p.type === "journal") return gradeJournal(m, p, a);
    return gradeNumeric(m, p, a);
  });
  const score = parts.reduce((s, p) => s + p.score, 0);
  const max = parts.reduce((s, p) => s + p.max, 0);
  const boxes = parts.reduce((s, p) => s + p.boxes, 0);
  const filled = parts.reduce((s, p) => s + p.filled, 0);
  return { score, max, parts, progress: boxes ? Math.min(1, filled / boxes) : 0 };
}

function gradeGrid(m: Model, part: GridPart, ans: GridAnswers): PartResult {
  const res: PartResult = { partId: part.id, title: part.title, score: 0, max: 0, marks: {}, expected: {}, expectedLines: {}, boxes: 0, filled: 0 };
  let right = 0;
  let extra = 0;
  for (const r of part.rows) {
    if (r.kind === "heading") continue;
    for (const c of part.columns) {
      const cell = r.cells[c.id];
      if (cell && "given" in cell) continue;
      const key = `${r.id}.${c.id}`;
      const exp = m.value(`${part.id}.${key}`);
      const got = parseAmount(ans.cells?.[key]);
      res.expected[key] = exp;
      if (got !== null) res.filled++;
      if (!isZero(exp)) {
        res.max++;
        res.boxes++;
        if (got !== null && !Number.isNaN(got) && close(got, exp)) {
          right++;
          res.marks[key] = "right";
        } else if (got !== null) res.marks[key] = "wrong";
      } else if (got !== null) {
        if (!Number.isNaN(got) && isZero(got)) res.marks[key] = "right";
        else {
          res.marks[key] = "wrong";
          extra++;
        }
      }
    }
  }
  if (part.totals) {
    for (const c of part.columns) {
      const key = `total.${c.id}`;
      const exp = m.value(`${part.id}.total.${c.id}`);
      const got = parseAmount(ans.totals?.[c.id]);
      res.expected[key] = exp;
      res.max++;
      res.boxes++;
      if (got !== null) res.filled++;
      const ok = got === null ? false : !Number.isNaN(got) && close(got, exp);
      if (ok) right++;
      if (got !== null) res.marks[key] = ok ? "right" : "wrong";
    }
  }
  res.score = Math.max(0, right - extra);
  return res;
}

function gradeJournal(m: Model, part: JournalPart, ans: JournalAnswers): PartResult {
  const res: PartResult = { partId: part.id, title: part.title, score: 0, max: 0, marks: {}, expected: {}, expectedLines: {}, boxes: 0, filled: 0 };
  for (const e of part.entries) {
    const expected = e.lines.map((l, i) => ({
      account: l.account,
      side: (l.debit !== undefined ? "debit" : "credit") as "debit" | "credit",
      amount: m.value(`${part.id}.${e.id}.line${i + 1}`),
    }));
    res.expectedLines[e.id] = expected;
    res.max += expected.length;
    res.boxes += expected.length;
    const lines = (ans.entries?.[e.id] ?? [])
      .map((l, idx) => ({ idx, account: l.account, debit: parseAmount(l.debit), credit: parseAmount(l.credit) }))
      .filter((l) => l.account || l.debit !== null || l.credit !== null);
    res.filled += Math.min(lines.length, expected.length);
    const used = new Set<number>();
    let right = 0;
    for (const x of expected) {
      const hit = lines.find((l) => {
        if (used.has(l.idx) || l.account !== x.account) return false;
        const amt = x.side === "debit" ? l.debit : l.credit;
        const other = x.side === "debit" ? l.credit : l.debit;
        return amt !== null && !Number.isNaN(amt) && close(amt, x.amount) && (other === null || isZero(other));
      });
      if (hit) {
        used.add(hit.idx);
        right++;
        res.marks[`${e.id}.${hit.idx}`] = "right";
      }
    }
    let extra = 0;
    for (const l of lines) {
      if (!used.has(l.idx)) {
        res.marks[`${e.id}.${l.idx}`] = "wrong";
        extra++;
      }
    }
    if (lines.length) res.marks[e.id] = right === expected.length && extra === 0 ? "right" : "wrong";
    // Penalise only lines beyond the expected count; a wrong line already loses its own mark.
    res.score += Math.max(0, right - Math.max(0, lines.length - expected.length));
  }
  return res;
}

function gradeNumeric(m: Model, part: NumericPart, ans: NumericAnswers): PartResult {
  const res: PartResult = { partId: part.id, title: part.title, score: 0, max: 0, marks: {}, expected: {}, expectedLines: {}, boxes: 0, filled: 0 };
  for (const q of part.questions) {
    const term = textAnswer(q);
    if (term !== undefined) {
      (res.expectedText ??= {})[q.id] = term;
      res.max++;
      res.boxes++;
      const got = ans.values?.[q.id];
      if (typeof got !== "string" || !got.trim()) continue;
      res.filled++;
      const ok = [term, ...(q.acceptedAnswers ?? [])].some((value) => normalizeTerm(value) === normalizeTerm(got));
      res.marks[q.id] = ok ? "right" : "wrong";
      if (ok) res.score++;
      continue;
    }
    const exp = m.value(`${part.id}.${q.id}`);
    const got = parseAmount(ans.values?.[q.id]);
    res.expected[q.id] = exp;
    res.max++;
    res.boxes++;
    if (got === null) continue;
    res.filled++;
    const ok = !Number.isNaN(got) && close(got, exp, Math.max(q.tolerance ?? 0, CELL_TOLERANCE));
    res.marks[q.id] = ok ? "right" : "wrong";
    if (ok) res.score++;
  }
  return res;
}

/** The answer key filled in as if a student had answered everything correctly (for the doctor's preview). */
export function perfectAnswers(spec: ExerciseSpec, params: Values): StudentAnswers {
  spec = effectiveSpec(spec, params);
  const m = new Model(spec, params);
  const out: StudentAnswers = {};
  for (const p of spec.parts) {
    if (p.type === "grid") {
      const cells: Record<string, string> = {};
      for (const r of p.rows) {
        if (r.kind === "heading") continue;
        for (const c of p.columns) {
          const cell = r.cells[c.id];
          if (cell && "given" in cell) continue;
          const v = m.value(`${p.id}.${r.id}.${c.id}`);
          if (!isZero(v)) cells[`${r.id}.${c.id}`] = formatAmount(v);
        }
      }
      const totals = p.totals
        ? Object.fromEntries(p.columns.map((c) => [c.id, formatAmount(m.value(`${p.id}.total.${c.id}`))]))
        : {};
      out[p.id] = { cells, totals };
    } else if (p.type === "journal") {
      out[p.id] = {
        entries: Object.fromEntries(
          p.entries.map((e) => [
            e.id,
            e.lines.map((l, i) => {
              const v = formatAmount(m.value(`${p.id}.${e.id}.line${i + 1}`));
              return { account: l.account, debit: l.debit !== undefined ? v : "", credit: l.credit !== undefined ? v : "" };
            }),
          ]),
        ),
      };
    } else {
      out[p.id] = { values: Object.fromEntries(p.questions.map((q) => [q.id, textAnswer(q) ?? formatAmount(m.value(`${p.id}.${q.id}`))])) };
    }
  }
  return out;
}

/** Remove the correct values from a result before sending it to a student who may not see answers yet. */
export function stripExpected(r: GradeResult): GradeResult {
  return { ...r, parts: r.parts.map((p) => ({ ...p, expected: {}, expectedText: {}, expectedLines: {} })) };
}
