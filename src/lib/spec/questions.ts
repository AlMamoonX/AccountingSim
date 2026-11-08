/** Numeric parts can also contain short, exactly marked terminology questions. */
export function textAnswer(q: { answer: string; answerKind?: "number" | "text"; prompt?: string }): string | undefined {
  if (q.answerKind === "text") return q.answer;
  if (q.answerKind === "number") return undefined;
  // Compatibility for existing AI drafts that put an accounting term in a
  // formula field. Keep malformed arithmetic subject to formula validation.
  if (/^[\p{L}][\p{L}\s'’]*\s(?:assumption|principle|concept|convention)$/iu.test(q.answer.trim())) return q.answer;
  if (/^[\p{L}][\p{L}\s'’]*$/u.test(q.answer.trim()) && /\b(assumption|principle|concept|convention)\b/i.test(q.prompt ?? "")) return q.answer;
  return undefined;
}

export const normalizeTerm = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/[.!?]+$/, "").replace(/\s+/g, " ");
