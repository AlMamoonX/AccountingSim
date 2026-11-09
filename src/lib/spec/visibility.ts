import { names, parse } from "./expr";
import { formatAmount } from "./format";
import type { ExerciseSpec } from "./schema";

/**
 * Finds inputs the answer key depends on that students are never shown.
 *
 * Students see numbers only through {{formula}} placeholders (story, transactions, instructions,
 * row labels, entry descriptions, question prompts) and through "given" grid cells. If an answer uses
 * a parameter that appears in none of those, the task can't be solved – e.g. an exercise that says
 * "use the trial balance below" but never shows one.
 */
export function hiddenInputs(spec: ExerciseSpec): string[] {
  const params = new Map(spec.params.map((p) => [p.name, p]));
  const visible = new Set<string>();
  const used = new Set<string>();
  const add = (set: Set<string>, expr: string | undefined) => {
    if (!expr) return;
    try {
      for (const n of names(parse(expr))) set.add(n);
    } catch {
      /* bad formulas are reported elsewhere */
    }
  };
  const shownText: string[] = [];
  const show = (text: string | undefined) => {
    if (!text) return;
    shownText.push(text);
    for (const m of text.matchAll(/\{\{([^}]+)\}\}/g)) add(visible, m[1]);
  };

  show(spec.story);
  spec.transactions.forEach((t) => show(t.text));
  for (const part of spec.parts) {
    show(part.title);
    show(part.instructions);
    if (part.type === "grid") {
      for (const r of part.rows) {
        show(r.label);
        for (const c of Object.values(r.cells)) "given" in c ? add(visible, c.given) : add(used, c.answer);
      }
    } else if (part.type === "journal") {
      for (const e of part.entries) {
        show(e.label);
        show(e.description);
        for (const l of e.lines) add(used, l.debit ?? l.credit);
      }
    } else {
      for (const q of part.questions) {
        show(q.prompt);
        if (q.answerKind !== "text") add(used, q.answer);
      }
    }
  }

  const literal = shownText.join("\n");
  const hidden = [...used].filter((n) => {
    const p = params.get(n);
    if (!p || visible.has(n)) return false;
    // A fixed value written out literally ("6% a year", "OMR 12,000") is visible too.
    const fixed = p.min === undefined && p.max === undefined;
    return !(fixed && writtenOut(literal, p.value));
  });
  return hidden.map((n) => {
    const p = params.get(n)!;
    const what = p.label ? `${p.label} = ${formatAmount(p.value)}` : formatAmount(p.value);
    return (
      `Students are never shown "${n}" (${what}), but the answer key uses it, so they can't work it out. ` +
      `Show it with {{${n}}} in the story, a transaction or a question, or as a "given" cell ` +
      `(e.g. an unadjusted trial balance table), or stop using it in answers.`
    );
  });
}

function writtenOut(text: string, value: number): boolean {
  const forms = new Set([formatAmount(value), String(value)]);
  if (Math.abs(value) < 1) forms.add(`${formatAmount(value * 100)}%`);
  return [...forms].some((f) => f !== "0" && new RegExp(`(^|[^\\d.,])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d])`).test(text));
}
