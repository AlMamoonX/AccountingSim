import { describe, it, expect } from "vitest";
import { SimSpecSchema } from "./schema";
import {
  analyzeSim,
  businessScore,
  defaultDecisions,
  finalMark,
  initialState,
  monthExercise,
  runCompany,
  simulateMonth,
  statementsView,
  validateDecisions,
} from "./engine";
import { karakSim } from "./fixtures/karakSim";
import { grade, perfectAnswers, buildView } from "@/lib/spec/engine";

const spec = SimSpecSchema.parse(karakSim);
const defaults = defaultDecisions(spec);

describe("Karak Corner sample sim", () => {
  it("passes its own validation with random players", () => {
    const a = analyzeSim(spec, 30);
    expect(a.errors).toEqual([]);
    expect(a.failed).toEqual([]);
    expect(a.ok).toBe(true);
  });

  it("starts from the opening formulas", () => {
    expect(initialState(spec)).toMatchObject({ cash: 3560, machine: 1440, capital: 5000, re: 0, loan: 0 });
  });

  it("month 1 with default decisions makes sense", () => {
    const r = simulateMonth(spec, 1, defaults, initialState(spec));
    // 6,000 cups wanted at the usual price, +5% from OMR 100 marketing
    expect(r.values.demand).toBe(6300);
    expect(r.values.unitsSold).toBe(6000);
    expect(r.values.lostSales).toBe(300);
    expect(r.values.revenue).toBe(3000);
    expect(r.values.cogs).toBe(600);
    expect(r.values.netIncome).toBe(3000 - 600 - 400 - 600 - 100 - 60);
    expect(r.event).toBeNull();
    expect(r.feedback.join(" ")).toMatch(/300 customers/);
  });

  it("each month opens on the previous month's true closing books", () => {
    const runs = runCompany(spec, [defaults, { ...defaults, buyUnits: 8000, takeLoan: 1 }, defaults, defaults]);
    expect(runs).toHaveLength(4);
    for (let i = 1; i < runs.length; i++) expect(runs[i].opening).toEqual(runs[i - 1].closing);
    expect(runs[1].event?.title).toBe("Supplier raises prices");
    expect(runs[1].values.unitCost).toBeCloseTo(0.12);
    expect(runs[2].values.interest).toBe(20); // 1% of the OMR 2,000 loan taken in month 2
  });

  it("the same decisions always give the same company", () => {
    const d = [defaults, { ...defaults, price: 0.35 }, defaults];
    expect(runCompany(spec, d)).toEqual(runCompany(spec, d));
  });

  it("missing months are auto-played on default decisions", () => {
    const withGap = runCompany(spec, [defaults, null, defaults], 3);
    const explicit = runCompany(spec, [defaults, defaults, defaults], 3);
    expect(withGap).toEqual(explicit);
  });

  it("each month's books are a normal markable exercise with only the transactions that happened", () => {
    const runs = runCompany(spec, [{ ...defaults, takeLoan: 1, marketing: 0 }, defaults]);
    const ex1 = monthExercise(spec, runs[0]);
    const p1 = Object.fromEntries(ex1.params.map((p) => [p.name, p.value]));
    const view = buildView(ex1, p1);
    const journal = view.parts.find((p) => p.id === "J");
    expect(journal?.type).toBe("journal");
    const ids = journal && journal.type === "journal" ? journal.entries.map((e) => e.id) : [];
    expect(ids).toContain("loanE");
    expect(ids).not.toContain("mkt"); // no marketing that month
    expect(ids).not.toContain("intE"); // no interest yet in month 1
    expect(view.transactions.map((t) => t.text).join(" ")).not.toMatch(/marketing/);

    const g = grade(ex1, p1, perfectAnswers(ex1, p1));
    expect(g.score).toBe(g.max);
    expect(g.max).toBeGreaterThan(10);
  });

  it("shows statements with every value filled in", () => {
    const r = runCompany(spec, [defaults])[0];
    const sv = statementsView(spec, r)!;
    expect(sv.parts).toHaveLength(2);
    const bs = sv.parts[1];
    expect(bs.type === "grid" && bs.rows.every((row) => Object.values(row.cells).every((c) => c && "given" in c))).toBe(true);
  });

  it("scores the business between poor and excellent, and mixes the final mark", () => {
    const runs = runCompany(spec, [defaults, defaults, defaults, defaults]);
    const s = businessScore(spec, runs);
    expect(s.raw).toBeCloseTo(runs[3].closing.capital + runs[3].closing.re);
    expect(s.pct).toBeGreaterThan(0);
    expect(s.pct).toBeLessThanOrEqual(1);
    expect(finalMark(20, 40, 1, 70)).toBe(65); // 0.7 × 50% + 0.3 × 100%
    expect(finalMark(0, 0, 0, 70)).toBe(0);
  });

  it("rejects decisions outside the rules", () => {
    expect(validateDecisions(spec, { ...defaults, price: 0.33 }).ok).toBe(false); // not a 0.05 step
    expect(validateDecisions(spec, { ...defaults, buyUnits: 99999 }).ok).toBe(false);
    expect(validateDecisions(spec, { ...defaults, takeLoan: 2 }).ok).toBe(false);
    expect(validateDecisions(spec, { ...defaults, price: "0.45" }).ok).toBe(true);
  });
});

describe("broken sims are caught", () => {
  it("accepts an existing month's literal theory answer and grades it with the monthly books", () => {
    const s = SimSpecSchema.parse({ ...karakSim, monthWork: [{ month: 1, title: "April 2026", parts: [{ id: "Theory", type: "numeric", title: "Assumptions", questions: [{ id: "p1", prompt: "Which assumption separates personal and business spending?", answer: "Business entity assumption" }] }] }] });
    expect(analyzeSim(s, 1).ok).toBe(true);
    const ex = monthExercise(s, runCompany(s, [], 1)[0]);
    const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
    expect(grade(ex, params, { Theory: { values: { p1: "Business entity assumption" } } })).toMatchObject({ score: 1, max: 1 });
  });

  it("supports long simulations and coursework after month twelve", () => {
    const long = SimSpecSchema.parse({ ...karakSim, months: 36, monthWork: Array.from({ length: 36 }, (_, i) => ({
      month: i + 1, title: `Month ${i + 1} task`, parts: [{ id: "LongWork", type: "numeric", title: "Cash", questions: [{ id: "cashQ", prompt: "Closing cash?", answer: "cash_end" }] }],
    })) });
    const results = runCompany(long, [], 36);
    expect(results).toHaveLength(36);
    expect(results[35].opening).toEqual(results[34].closing);
    const ex = monthExercise(long, results[35]);
    const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
    expect(ex.title).toBe("Month 36 task");
    expect(grade(ex, params, perfectAnswers(ex, params))).toMatchObject({ score: 1, max: 1 });
    expect(analyzeSim(long, 1).ok).toBe(true);
  });

  it("finds a books equation that doesn't balance", () => {
    const bad = SimSpecSchema.parse({
      ...karakSim,
      state: karakSim.state.map((s) => (s.name === "cash" ? { ...s, closing: "cash + revenue" } : s)),
    });
    const a = analyzeSim(bad, 5);
    expect(a.ok).toBe(false);
    expect(a.failed.join(" ")).toMatch(/Assets = Liabilities \+ Equity/);
  });

  it("finds unknown names and duplicate names", () => {
    const bad = SimSpecSchema.parse({
      ...karakSim,
      derived: [...karakSim.derived!, { name: "rent", expr: "nope + 1" }],
    });
    expect(analyzeSim(bad, 2).errors.join(" ")).toMatch(/used twice/);
  });

  it("rejects malformed AI output", () => {
    expect(SimSpecSchema.safeParse({ title: "x", months: 40 }).success).toBe(false);
  });
});

describe("score calibration of the sample", () => {
  it("default play is in the middle, a smart player scores higher", () => {
    const d = defaultDecisions(spec);
    const lazy = businessScore(spec, runCompany(spec, [d, d, d, d]));
    const smart = { ...d, price: 0.35, buyUnits: 11000, marketing: 100 };
    const good = businessScore(spec, runCompany(spec, [smart, smart, smart, smart]));
    expect(lazy.pct).toBeGreaterThan(0.3);
    expect(lazy.pct).toBeLessThan(0.9);
    expect(good.raw).toBeGreaterThan(lazy.raw);
  });
});

describe("unknown names in AI-generated sims", () => {
  // Reproduces the doctor's report: the AI named the payables journal account "apAcc"
  // and then used that id as if it were an amount in the balance sheet and the A = L + E check.
  function withApAccMistake() {
    const s = structuredClone(karakSim) as unknown as Record<string, unknown> & typeof karakSim;
    const j = structuredClone(s.monthParts.find((p) => p.id === "J")) as unknown as { accounts: { id: string; label: string }[] };
    j.accounts.push({ id: "apAcc", label: "Accounts payable" });
    s.checks![0] = { label: "Assets = Liabilities + Equity", expr: "cash_end + inventory_end + machine_end == apAcc + loan_end + capital_end + re_end" };
    const bs = structuredClone(s.statements!.find((p) => p.id === "BS")) as unknown as { title: string; rows: { id: string; label: string; kind: string; cells: Record<string, { answer: string }> }[] };
    bs.title = "Balance Sheet at End of Month 4";
    bs.rows.splice(4, 0, { id: "l0", label: "Accounts payable", kind: "entry", cells: { amt: { answer: "apAcc" } } });
    s.monthWork = [{ month: 4, title: "April books", instructions: "Record April and prepare the balance sheet.", parts: [j, bs] }] as unknown as typeof karakSim.monthWork;
    return SimSpecSchema.parse(s);
  }

  it("explains that an account id is not an amount and points to real names", () => {
    const a = analyzeSim(withApAccMistake(), 2);
    expect(a.ok).toBe(false);
    const check = a.errors.find((e) => e.startsWith('Check "Assets = Liabilities + Equity"'));
    expect(check).toContain('Unknown name "apAcc"');
    expect(check).toContain('journal account "Accounts payable"');
    expect(check).toContain("have no value");
    expect(check).toMatch(/_end/);
    const books = a.errors.find((e) => e.includes("books") && e.includes("apAcc"));
    expect(books).toContain('journal account "Accounts payable"');
  });

  it("suggests the closest defined name for a typo", () => {
    const s = structuredClone(karakSim) as typeof karakSim;
    s.checks![0] = { label: "Assets = Liabilities + Equity", expr: "cahs_end + inventory_end + machine_end == loan_end + capital_end + re_end" };
    const a = analyzeSim(SimSpecSchema.parse(s), 1);
    const msg = a.errors.find((e) => e.includes('"cahs_end"'));
    expect(msg).toContain("is not defined");
    expect(msg).toMatch(/Closest existing names: cash_end/);
  });

  it("leaves a valid sim's analysis untouched", () => {
    expect(analyzeSim(spec, 3).errors).toEqual([]);
  });
});

describe("failed checks explain themselves with numbers", () => {
  it("shows both sides, the gap and each amount for an unbalanced A = L + E", () => {
    const s = structuredClone(karakSim) as typeof karakSim;
    // Retained earnings left out: the same kind of imbalance the AI produced on the live site.
    s.checks![0] = { label: "Assets = Liabilities + Equity", expr: "cash_end + inventory_end + machine_end == loan_end + capital_end" };
    const a = analyzeSim(SimSpecSchema.parse(s), 1);
    const msg = a.failed.find((f) => f.startsWith("Assets = Liabilities + Equity – fails in January (default"));
    expect(msg).toBeDefined();
    expect(msg).toMatch(/left side [\d,.-]+ == right side [\d,.-]+ is false \(difference [\d,.-]+\)/);
    expect(msg).toMatch(/values: .*cash_end=[\d,.-]+.*capital_end=[\d,.-]+/);
  });

  it("points at the false clause of an && check", () => {
    const s = structuredClone(karakSim) as typeof karakSim;
    s.checks![1] = { label: "Stock never goes below zero", expr: "stockUnits_end >= 0 && inventory_end < -1" };
    const msg = analyzeSim(SimSpecSchema.parse(s), 1).failed.find((f) => f.startsWith("Stock never goes below zero"));
    expect(msg).toContain("values: inventory_end=");
    expect(msg).not.toContain("stockUnits_end=");
  });
});
