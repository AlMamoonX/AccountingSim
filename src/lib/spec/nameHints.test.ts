import { describe, it, expect } from "vitest";
import { explainUnknownNames } from "./nameHints";
import type { Part } from "./schema";

const journal = { id: "J", type: "journal", title: "", instructions: "", accounts: [{ id: "apAcc", label: "Accounts payable" }, { id: "cashAcc", label: "Cash" }], entries: [] } as unknown as Part;

describe("explainUnknownNames", () => {
  it("passes other messages through unchanged", () => {
    expect(explainUnknownNames(["Formula loop: a → b → a"], { known: ["a"], parts: [] })).toEqual(["Formula loop: a → b → a"]);
  });

  it("flags journal account ids used as amounts and suggests the payables state", () => {
    const [m] = explainUnknownNames(['Row "AP": Unknown name "apAcc"'], { known: ["payables", "payables_end", "cash_end"], parts: [journal] });
    expect(m).toContain('journal account "Accounts payable" (part J)');
    expect(m).toContain("payables_end");
  });

  it("suggests close names for typos and says when nothing is close", () => {
    const [typo, none] = explainUnknownNames(['Unknown name "revenu"', 'Unknown name "zzz"'], { known: ["revenue", "cogs"], parts: [] });
    expect(typo).toContain("Closest existing names: revenue");
    expect(none).toContain('"zzz" is not defined');
    expect(none).not.toContain("Closest");
  });
});
