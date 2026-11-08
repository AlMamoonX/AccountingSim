import { describe, it, expect } from "vitest";
import { parse, evaluate } from "./expr";
import { ExerciseSpecSchema } from "./schema";
import {
  Model,
  analyze,
  buildView,
  grade,
  paramsForSeed,
  perfectAnswers,
  defaultParams,
  parseAmount,
  formatAmount,
  stripExpected,
} from "./engine";
import { karakSpec } from "./fixtures/karak";

const spec = ExerciseSpecSchema.parse(karakSpec);
const calc = (s: string, vars: Record<string, number> = {}) => evaluate(parse(s), (n) => vars[n]);

describe("short accounting theory answers", () => {
  const theory = (question: object) => ExerciseSpecSchema.parse({
    ...karakSpec, checks: [], parts: [{ id: "Theory", type: "numeric", title: "Accounting assumptions", questions: [question] }],
  });

  it("opens and grades the existing Business entity assumption draft without parsing it as a formula", () => {
    const s = theory({ id: "p1", prompt: "Home remodelling is not recorded in the business books — which assumption?", answer: "Business entity assumption" });
    const params = defaultParams(s);
    expect(analyze(s).ok).toBe(true);
    const view = buildView(s, params);
    expect(view.parts[0].type === "numeric" && view.parts[0].questions[0].inputKind).toBe("text");
    expect(JSON.stringify(view)).not.toContain("Business entity assumption");
    expect(grade(s, params, { Theory: { values: { p1: "  business   entity assumption. " } } })).toMatchObject({ score: 1, max: 1 });
    expect(grade(s, params, perfectAnswers(s, params))).toMatchObject({ score: 1, max: 1 });
  });

  it("supports explicit text answers and accepted synonyms while keeping corrections hidden in practice checks", () => {
    const s = theory({ id: "p1", prompt: "Which assumption?", answerKind: "text", answer: "Business entity assumption", acceptedAnswers: ["Economic entity assumption"] });
    const params = defaultParams(s);
    expect(grade(s, params, { Theory: { values: { p1: "Economic entity assumption" } } }).score).toBe(1);
    const wrong = grade(s, params, { Theory: { values: { p1: "Going concern" } } });
    expect(wrong).toMatchObject({ score: 0, max: 1 });
    expect(wrong.parts[0].expectedText).toEqual({ p1: "Business entity assumption" });
    expect(JSON.stringify(stripExpected(wrong))).not.toContain("Business entity assumption");
    expect(grade(s, params, {}).progress).toBe(0);
  });

  it("still rejects malformed numerical formulas instead of treating them as text", () => {
    expect(analyze(theory({ id: "p1", prompt: "Calculate the cost", answer: "rent wages" })).ok).toBe(false);
    expect(analyze(theory({ id: "p1", prompt: "Which assumption?", answerKind: "number", answer: "Business entity assumption" })).ok).toBe(false);
  });
});

describe("formula language", () => {
  it("does arithmetic with precedence", () => {
    expect(calc("1 + 2 * 3")).toBe(7);
    expect(calc("-(2 + 3) * 2")).toBe(-10);
    expect(calc("-a * b", { a: 2, b: 3 })).toBe(-6);
    expect(calc("10 / 4")).toBe(2.5);
  });
  it("supports functions and comparisons", () => {
    expect(calc("sum(1, 2, 3)")).toBe(6);
    expect(calc("round(2.345, 2)")).toBe(2.35);
    expect(calc("if(a > 1, 10, 20)", { a: 2 })).toBe(10);
    expect(calc("0.1 + 0.2 == 0.3")).toBe(1);
    expect(calc("1 < 2 && 2 < 1")).toBe(0);
  });
  it("reads dotted names", () => {
    expect(calc("A.total.cash + 1", { "A.total.cash": 5 })).toBe(6);
  });
  it("rejects code and junk", () => {
    expect(() => parse("process.exit()")).toThrow();
    expect(() => parse("1 +")).toThrow();
    expect(() => parse("a; b")).toThrow();
  });
});

describe("amount parsing", () => {
  it("accepts the ways students type numbers", () => {
    expect(parseAmount("1,200")).toBe(1200);
    expect(parseAmount("(1,200)")).toBe(-1200);
    expect(parseAmount("−4,000")).toBe(-4000);
    expect(parseAmount("OMR 7,000")).toBe(7000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNaN();
    expect(formatAmount(-2700)).toBe("−2,700");
  });
});

describe("Karak slide (Lecture 5)", () => {
  const m = new Model(spec, defaultParams(spec));

  it("matches the slide's balances", () => {
    expect(m.value("A.total.cash")).toBe(13900);
    expect(m.value("A.total.ar")).toBe(2000);
    expect(m.value("A.total.supplies")).toBe(3700);
    expect(m.value("A.total.equipment")).toBe(2000);
    expect(m.value("A.total.ap")).toBe(1800);
    expect(m.value("A.total.capital")).toBe(12500);
    expect(m.value("A.total.re")).toBe(7300);
    expect(m.value("A.group.assets")).toBe(21600);
    expect(m.value("A.group.liabilities")).toBe(1800);
    expect(m.value("A.group.equity")).toBe(19800);
  });

  it("passes all of its own checks", () => {
    const a = analyze(spec);
    expect(a.errors).toEqual([]);
    expect(a.checks.every((c) => c.ok)).toBe(true);
  });

  it("gives full marks to a perfect answer: 18 boxes + 7 totals + 4 journal lines + 1 question", () => {
    const p = defaultParams(spec);
    const r = grade(spec, p, perfectAnswers(spec, p));
    expect(r.max).toBe(30);
    expect(r.score).toBe(30);
    expect(r.parts.map((x) => x.max)).toEqual([25, 4, 1]);
    expect(r.progress).toBe(1);
  });

  it("marks wrong boxes and extra entries", () => {
    const p = defaultParams(spec);
    const answers = perfectAnswers(spec, p);
    const A = answers.A as { cells: Record<string, string> };
    A.cells["r6.cash"] = "-2,600"; // wrong
    A.cells["r8.cash"] = "-5,000"; // personal: should be empty
    const r = grade(spec, p, answers);
    const partA = r.parts[0];
    expect(partA.marks["r6.cash"]).toBe("wrong");
    expect(partA.marks["r8.cash"]).toBe("wrong");
    expect(partA.score).toBe(25 - 1 - 1);
  });

  it("marks journal lines in any order and rejects the wrong side", () => {
    const p = defaultParams(spec);
    const answers = {
      B: {
        entries: {
          e2: [
            { account: "cash", debit: "", credit: "4,000" },
            { account: "equipment", debit: "4000", credit: "" },
          ],
          e9: [
            { account: "cash", debit: "", credit: "1000" },
            { account: "ar", debit: "1000", credit: "" },
          ],
        },
      },
    };
    const r = grade(spec, p, answers);
    expect(r.parts[1].score).toBe(2);
    expect(r.parts[1].marks.e2).toBe("right");
    expect(r.parts[1].marks.e9).toBe("wrong");
  });

  it("student view contains no answers", () => {
    const v = buildView(spec, defaultParams(spec));
    const json = JSON.stringify(v);
    expect(v.transactions[0].text).toContain("12,500");
    expect(json).not.toContain("21600");
    expect(json).not.toContain("answer");
    expect(v.parts[0].type).toBe("grid");
  });

  it("makes different, still-valid numbers per student", () => {
    const a = paramsForSeed(spec, 1234);
    const b = paramsForSeed(spec, 98765);
    expect(a).not.toEqual(defaultParams(spec));
    expect(a).not.toEqual(b);
    expect(analyze(spec, a).ok).toBe(true);
    expect(paramsForSeed(spec, 1234)).toEqual(a); // same student → same numbers
    expect(paramsForSeed(spec, 0)).toEqual(defaultParams(spec));
  });
});

describe("broken exercises are caught", () => {
  it("finds unknown names, unknown columns and failed checks", () => {
    const bad = ExerciseSpecSchema.parse({
      ...karakSpec,
      parts: [
        {
          id: "A",
          type: "grid",
          title: "T",
          columns: [{ id: "cash", label: "Cash" }],
          rows: [
            { id: "r1", label: "x", cells: { cash: { answer: "nope" } } },
            { id: "r2", label: "y", cells: { bank: { answer: "1" } } },
          ],
          checks: [{ label: "fails", expr: "total.cash == 1" }],
        },
      ],
    });
    const a = analyze(bad);
    expect(a.ok).toBe(false);
    expect(a.errors.join("\n")).toMatch(/unknown column "bank"/);
  });

  it("rejects malformed AI output", () => {
    const r = ExerciseSpecSchema.safeParse({ title: "x", business: { name: "y" }, parts: [{ id: "A", type: "pie" }] });
    expect(r.success).toBe(false);
  });
});
