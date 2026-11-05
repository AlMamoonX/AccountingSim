import type { SpecInput } from "../schema";

/**
 * "Ahmed's Specialized Karak: March Transactions" (CS2 145, Lecture 5), rebuilt in the exercise format.
 * Answer: Assets 21,600 = Liabilities 1,800 + Equity 19,800.
 */
export const karakSpec: SpecInput = {
  version: 1,
  title: "Ahmed's Specialized Karak: March Transactions",
  business: { name: "Ahmed's Specialized Karak", description: "A small karak tea shop that also does corporate catering." },
  currency: "OMR",
  period: "March 2026",
  story:
    "Ahmed opens a specialized karak tea business. Record each March transaction in the accounting equation: Assets = Liabilities + Equity.",
  params: [
    { name: "invest", label: "Owner investment", value: 12500, min: 10000, max: 15000, step: 500 },
    { name: "equip", label: "Brewing equipment", value: 4000, min: 3000, max: 5000, step: 100 },
    { name: "supplies", label: "Tea and cardamom supplies", value: 3700, min: 2500, max: 4500, step: 100 },
    { name: "sales", label: "Cash sales", value: 7000, min: 5000, max: 9000, step: 100 },
    { name: "catering", label: "Catering on account", value: 3000, min: 2000, max: 4000, step: 100 },
    { name: "rent", label: "Rent", value: 1100, min: 800, max: 1500, step: 50 },
    { name: "wages", label: "Wages", value: 1200, min: 900, max: 1600, step: 50 },
    { name: "utilities", label: "Utilities", value: 400, min: 200, max: 600, step: 50 },
    { name: "paySupplier", label: "Paid to supplier", value: 1900, min: 1000, max: 2400, step: 100 },
    { name: "remodel", label: "Personal home remodel", value: 5000, min: 3000, max: 8000, step: 500 },
    { name: "collect", label: "Collected from catering customer", value: 1000, min: 500, max: 1800, step: 100 },
    { name: "sellEquip", label: "Equipment sold at cost", value: 2000, min: 1000, max: 2500, step: 100 },
  ],
  transactions: [
    { id: "t1", text: "Ahmed invests OMR {{invest}} cash to start the business (share capital)" },
    { id: "t2", text: "Buys commercial brewing equipment for OMR {{equip}} cash" },
    { id: "t3", text: "Buys tea leaves & cardamom supplies on account, OMR {{supplies}}" },
    { id: "t4", text: "Earns OMR {{sales}} Karak sales revenue in cash" },
    { id: "t5", text: "Provides corporate catering on account, OMR {{catering}}" },
    { id: "t6", text: "Pays rent OMR {{rent}}, wages OMR {{wages}}, utilities OMR {{utilities}}" },
    { id: "t7", text: "Pays OMR {{paySupplier}} cash to the tea supplier on account" },
    { id: "t8", text: "Pays OMR {{remodel}} from his personal account for a home remodel" },
    { id: "t9", text: "Collects OMR {{collect}} cash from the catering customer" },
    { id: "t10", text: "Sells unused equipment at its original cost, OMR {{sellEquip}} cash" },
  ],
  parts: [
    {
      id: "A",
      type: "grid",
      title: "Transaction analysis: Assets = Liabilities + Equity",
      instructions: "Enter the effect of each transaction on each account. Use a minus sign for decreases. Leave a box empty if there is no effect.",
      groups: [
        { id: "assets", label: "Assets" },
        { id: "liabilities", label: "Liabilities" },
        { id: "equity", label: "Equity" },
      ],
      columns: [
        { id: "cash", label: "Cash", group: "assets" },
        { id: "ar", label: "Accounts receivable", group: "assets" },
        { id: "supplies", label: "Supplies", group: "assets" },
        { id: "equipment", label: "Equipment", group: "assets" },
        { id: "ap", label: "Accounts payable", group: "liabilities" },
        { id: "capital", label: "Share capital", group: "equity" },
        { id: "re", label: "Retained earnings", group: "equity" },
      ],
      rows: [
        { id: "r1", label: "1. Owner invests cash", cells: { cash: { answer: "invest" }, capital: { answer: "invest" } } },
        { id: "r2", label: "2. Buy equipment", cells: { cash: { answer: "-equip" }, equipment: { answer: "equip" } } },
        { id: "r3", label: "3. Supplies on account", cells: { supplies: { answer: "supplies" }, ap: { answer: "supplies" } } },
        { id: "r4", label: "4. Cash sales (income)", cells: { cash: { answer: "sales" }, re: { answer: "sales" } } },
        { id: "r5", label: "5. Catering on account (income)", cells: { ar: { answer: "catering" }, re: { answer: "catering" } } },
        {
          id: "r6",
          label: "6. Rent, wages, utilities (expenses)",
          cells: { cash: { answer: "-(rent + wages + utilities)" }, re: { answer: "-(rent + wages + utilities)" } },
        },
        { id: "r7", label: "7. Pay supplier", cells: { cash: { answer: "-paySupplier" }, ap: { answer: "-paySupplier" } } },
        { id: "r8", label: "8. Personal remodel", cells: {} },
        { id: "r9", label: "9. Collect from customer", cells: { cash: { answer: "collect" }, ar: { answer: "-collect" } } },
        { id: "r10", label: "10. Sell equipment at cost", cells: { cash: { answer: "sellEquip" }, equipment: { answer: "-sellEquip" } } },
      ],
      rowHeader: "Transaction",
      totals: true,
      totalsLabel: "Balance 31 March",
      checks: [
        { label: "Assets = Liabilities + Equity", expr: "group.assets == group.liabilities + group.equity" },
        { label: "Cash never goes below zero", expr: "total.cash >= 0" },
        { label: "Customer can't pay more than owed", expr: "collect <= catering" },
        { label: "Can't pay supplier more than owed", expr: "paySupplier <= supplies" },
        { label: "Can't sell more equipment than bought", expr: "sellEquip <= equip" },
      ],
    },
    {
      id: "B",
      type: "journal",
      title: "Journal entries",
      instructions: "Write the journal entries for transactions 2 and 9.",
      accounts: [
        { id: "cash", label: "Cash" },
        { id: "ar", label: "Accounts receivable" },
        { id: "supplies", label: "Supplies" },
        { id: "equipment", label: "Equipment" },
        { id: "ap", label: "Accounts payable" },
        { id: "capital", label: "Share capital" },
        { id: "revenue", label: "Revenue" },
      ],
      entries: [
        {
          id: "e2",
          label: "2",
          description: "Buys commercial brewing equipment for OMR {{equip}} cash",
          lines: [
            { account: "equipment", debit: "equip" },
            { account: "cash", credit: "equip" },
          ],
        },
        {
          id: "e9",
          label: "9",
          description: "Collects OMR {{collect}} cash from the catering customer",
          lines: [
            { account: "cash", debit: "collect" },
            { account: "ar", credit: "collect" },
          ],
        },
      ],
    },
    {
      id: "C",
      type: "numeric",
      title: "Check your equation",
      questions: [{ id: "assets", prompt: "What are total assets on 31 March?", answer: "A.group.assets", unit: "OMR" }],
    },
  ],
  checks: [],
};
