import type { Part } from "./schema";

/**
 * Turns bare `Unknown name "x"` errors into ones the AI (and the doctor) can act on:
 * says when "x" is a journal account id (a label, never an amount) and suggests the closest real names.
 * Without this the repair loop keeps getting the same terse error and never fixes it.
 */
export interface NameContext {
  /** Every name a formula may use. */
  known: Iterable<string>;
  /** Journal parts, to recognise account ids used as if they were amounts. */
  parts: Iterable<Part>;
}

const UNKNOWN = /Unknown name "([^"]+)"/;

export function explainUnknownNames(problems: string[], ctx: NameContext): string[] {
  const known = [...new Set(ctx.known)];
  const accounts = new Map<string, { label: string; part: string }>();
  for (const p of ctx.parts) if (p.type === "journal") for (const a of p.accounts) if (!accounts.has(a.id)) accounts.set(a.id, { label: a.label, part: p.id });
  const hints = new Map<string, string>();
  return problems.map((msg) => {
    const m = UNKNOWN.exec(msg);
    if (!m) return msg;
    const name = m[1];
    if (!hints.has(name)) hints.set(name, hintFor(name, known, accounts));
    return `${msg}. ${hints.get(name)}`;
  });
}

function hintFor(name: string, known: string[], accounts: Map<string, { label: string; part: string }>): string {
  const acc = accounts.get(name);
  const similar = closest(name, known, accounts.has(name) ? 4 : 3);
  const tail = similar.length ? ` Closest existing names: ${similar.join(", ")}.` : "";
  if (acc) {
    return (
      `"${name}" is the id of the journal account "${acc.label}" (part ${acc.part}). Account ids are labels only and have no value, ` +
      `so they can never be used in a formula. Use the state or derived value for that amount instead (for a balance-sheet line, ` +
      `a state such as "payables" with opening/closing formulas, used as payables_end); add that state if it doesn't exist yet.${tail}`
    );
  }
  return `"${name}" is not defined. Define it (constant, derived value or state) or use an existing name.${tail}`;
}

function closest(name: string, known: string[], n: number): string[] {
  const target = name.toLowerCase();
  const stem = target.replace(/(acc|account|_end)$/, "");
  return known
    .map((k) => {
      const low = k.toLowerCase();
      let d = distance(target, low);
      if (stem.length >= 2 && (low.startsWith(stem) || low.includes(stem))) d = Math.min(d, 1);
      return { k, d };
    })
    .filter(({ k, d }) => d <= Math.max(2, Math.floor(Math.max(k.length, name.length) / 3)))
    .sort((a, b) => a.d - b.d || a.k.length - b.k.length || a.k.localeCompare(b.k))
    .slice(0, n)
    .map(({ k }) => k);
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
