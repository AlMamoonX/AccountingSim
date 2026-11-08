import { z } from "zod";
import { CheckSchema, Expr, GridPartSchema, Id, ParamSchema, PartSchema } from "@/lib/spec/schema";

/**
 * A company simulation: students run a business month by month.
 * Everything business- or accounting-specific (decisions, the model, events, the books) is data + formulas.
 *
 * Names available in formulas during a month:
 *   constants, `month` (1, 2, …), decisions, event variables, derived values,
 *   each state value X (opening of the month) and X_end (closing of the month).
 */

export const SimDecisionSchema = z
  .object({
    name: Id,
    label: z.string(),
    help: z.string().optional(),
    kind: z.enum(["number", "choice", "toggle"]).default("number"),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    default: z.number(),
    unit: z.string().optional(),
    options: z.array(z.object({ value: z.number(), label: z.string() })).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "number" && (d.min === undefined || d.max === undefined))
      ctx.addIssue({ code: "custom", message: `decision "${d.name}" needs min and max` });
    if (d.kind === "choice" && (!d.options || d.options.length < 2))
      ctx.addIssue({ code: "custom", message: `decision "${d.name}" needs at least 2 options` });
    if (d.kind === "toggle" && d.default !== 0 && d.default !== 1)
      ctx.addIssue({ code: "custom", message: `toggle "${d.name}" default must be 0 or 1` });
  });

export const SimStateSchema = z.object({
  name: Id,
  label: z.string(),
  /** Month 1 opening value (may use constants only). */
  opening: Expr,
  /** End-of-month value (any month name). */
  closing: Expr,
  kind: z.enum(["money", "count"]).default("money"),
});

export const SimDerivedSchema = z.object({
  name: Id,
  label: z.string().optional(),
  expr: Expr,
});

export const SimEventSchema = z.object({
  month: z.number().int().min(1),
  title: z.string(),
  text: z.string(),
  /** Event variables set this month, e.g. { "supplierRise": "0.2" }. */
  set: z.record(z.string(), Expr).default({}),
});

export const SimMetricSchema = z.object({
  label: z.string(),
  expr: Expr,
  kind: z.enum(["money", "count", "percent"]).default("money"),
});

/** Teacher-directed coursework for one month; the company model stays the same. */
export const SimMonthWorkSchema = z.object({
  month: z.number().int().min(1),
  title: z.string().min(1),
  instructions: z.string().default(""),
  transactions: z.array(z.object({ id: Id, text: z.string(), when: Expr.optional() })).optional(),
  parts: z.array(PartSchema).min(1),
});

export const SimSpecSchema = z.object({
  version: z.literal(1).default(1),
  kind: z.literal("sim").default("sim"),
  title: z.string().min(1),
  business: z.object({ name: z.string().min(1), description: z.string().optional() }),
  currency: z.string().default("OMR"),
  story: z.string().default(""),
  months: z.number().int().min(2),
  monthLabels: z.array(z.string()).default([]),
  constants: z.array(ParamSchema).default([]),
  decisions: z.array(SimDecisionSchema).min(1),
  state: z.array(SimStateSchema).min(1),
  derived: z.array(SimDerivedSchema).default([]),
  eventVars: z.array(z.object({ name: Id, label: z.string().optional(), default: z.number().default(0) })).default([]),
  events: z.array(SimEventSchema).default([]),
  /** Shown to students each month after they decide (may use {{formulas}} and a `when`). */
  monthTransactions: z.array(z.object({ id: Id, text: z.string(), when: Expr.optional() })).default([]),
  /** The books students keep each month (existing part types). */
  monthParts: z.array(PartSchema).min(1),
  /** Optional month-specific coursework, chosen by the teacher's AI request. */
  monthWork: z.array(SimMonthWorkSchema).default([]),
  /** Statements shown on the results screen (grid parts; every cell is shown filled in). */
  statements: z.array(GridPartSchema).default([]),
  metrics: z.array(SimMetricSchema).min(1),
  feedback: z.array(z.object({ when: Expr, text: z.string() })).default([]),
  /**
   * Business performance. Extra names allowed here: total_X (sum over months of a derived value)
   * and min_X_end / max_X_end (lowest / highest closing value of a state value).
   */
  score: z.object({ label: z.string(), expr: Expr, poor: z.number(), excellent: z.number() }),
  /** Must be true every month for ANY allowed decisions (e.g. assets = liabilities + equity). */
  checks: z.array(CheckSchema).default([]),
  outOfCourse: z.array(z.string()).default([]),
  teacherNotes: z.string().optional(),
});

export type SimSpec = z.infer<typeof SimSpecSchema>;
export type SimSpecInput = z.input<typeof SimSpecSchema>;
export type SimDecision = z.infer<typeof SimDecisionSchema>;
export type SimEvent = z.infer<typeof SimEventSchema>;
export type SimMonthWork = z.infer<typeof SimMonthWorkSchema>;
