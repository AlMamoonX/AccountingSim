import { describe, it, expect } from "vitest";
import { ExerciseSpecSchema } from "./schema";
import { hiddenInputs } from "./visibility";
import { parse } from "./expr";

// Reproduces the live "Falcon Fitness" exercise: the story promises an unadjusted trial balance,
// none is shown, yet the income statement needs rent and utilities.
const base = {
  title: "Adjusting entries",
  business: { name: "Gym" },
  story: "Use the unadjusted trial balance below.",
  params: [
    { name: "rent", label: "Rent expense", value: 900, min: 800, max: 1000 },
    { name: "utilities", label: "Utilities expense", value: 300, min: 200, max: 400 },
    { name: "depMonthly", value: 300, min: 200, max: 400 },
    { name: "rate", value: 0.06 },
  ],
  transactions: [{ id: "t1", text: "Monthly depreciation is OMR {{depMonthly}}. Interest is 6% a year." }],
  parts: [
    {
      id: "B",
      type: "grid",
      title: "Income statement",
      columns: [{ id: "amt", label: "OMR" }],
      rows: [
        { id: "r1", label: "Rent", cells: { amt: { answer: "rent" } } },
        { id: "r2", label: "Utilities", cells: { amt: { answer: "utilities" } } },
        { id: "r3", label: "Depreciation", cells: { amt: { answer: "depMonthly" } } },
        { id: "r4", label: "Interest", cells: { amt: { answer: "1000 * rate" } } },
      ],
    },
  ],
};

describe("hiddenInputs", () => {
  it("flags amounts the answer key needs but students never see", () => {
    const msgs = hiddenInputs(ExerciseSpecSchema.parse(base));
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toContain('"rent" (Rent expense = 900)');
    expect(msgs[1]).toContain('"utilities"');
    expect(msgs.join(" ")).not.toContain("depMonthly"); // shown via {{depMonthly}}
    expect(msgs.join(" ")).not.toContain('"rate"'); // fixed and written out as 6%
  });

  it("accepts a trial balance shown as given cells", () => {
    const s = structuredClone(base) as typeof base & { parts: unknown[] };
    s.parts.unshift({
      id: "TB",
      type: "grid",
      title: "Unadjusted trial balance",
      columns: [{ id: "dr", label: "Debit" }],
      rows: [
        { id: "a", label: "Rent expense", cells: { dr: { given: "rent" } } },
        { id: "b", label: "Utilities expense", cells: { dr: { given: "utilities" } } },
      ],
    });
    expect(hiddenInputs(ExerciseSpecSchema.parse(s))).toEqual([]);
  });
});

describe("bracket errors", () => {
  it("says how many brackets are unclosed", () => {
    expect(() => parse("abs((a + b) - (c) < 0.01")).toThrow(/1 more "\(" than "\)"/);
  });
});
