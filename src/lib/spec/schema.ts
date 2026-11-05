import { z } from "zod";

/**
 * The exercise format the AI writes and the doctor edits.
 * It contains no accounting rules: columns, accounts, rows and formulas are all data.
 */

export const Id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "ids use letters, digits and _ and start with a letter");

/** A formula, e.g. "rent + wages" or "-equipment" or 1200. */
export const Expr = z.union([z.string().min(1), z.number()]).transform((v) => String(v));

export const ParamSchema = z.object({
  name: Id,
  label: z.string().optional(),
  value: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
});

export const CheckSchema = z.object({
  label: z.string(),
  expr: Expr,
});

export const GridCellSchema = z.union([
  z.object({ answer: Expr }).strict(),
  z.object({ given: Expr }).strict(),
]);

export const GridRowSchema = z.object({
  id: Id,
  label: z.string(),
  /** entry: normal row, counted in column totals. total: a subtotal row (not counted). heading: a label only. */
  kind: z.enum(["entry", "total", "heading"]).default("entry"),
  cells: z.record(z.string(), GridCellSchema).default({}),
});

export const GridPartSchema = z.object({
  id: Id,
  type: z.literal("grid"),
  title: z.string(),
  instructions: z.string().optional(),
  groups: z.array(z.object({ id: Id, label: z.string() })).default([]),
  columns: z
    .array(z.object({ id: Id, label: z.string(), group: Id.optional() }))
    .min(1),
  /** Heading above the row labels, e.g. "Transaction" or "Item". */
  rowHeader: z.string().optional(),
  rows: z.array(GridRowSchema).min(1),
  /** Show a totals row at the bottom that students fill in (one mark per column). */
  totals: z.boolean().default(false),
  totalsLabel: z.string().optional(),
  checks: z.array(CheckSchema).default([]),
});

export const JournalLineSchema = z
  .object({
    account: Id,
    debit: Expr.optional(),
    credit: Expr.optional(),
  })
  .refine((l) => (l.debit === undefined) !== (l.credit === undefined), {
    message: "each journal line needs exactly one of debit or credit",
  });

export const JournalPartSchema = z.object({
  id: Id,
  type: z.literal("journal"),
  title: z.string(),
  instructions: z.string().optional(),
  accounts: z.array(z.object({ id: Id, label: z.string() })).min(2),
  entries: z
    .array(
      z.object({
        id: Id,
        label: z.string().optional(),
        description: z.string(),
        lines: z.array(JournalLineSchema).min(2),
      }),
    )
    .min(1),
  checks: z.array(CheckSchema).default([]),
});

export const NumericPartSchema = z.object({
  id: Id,
  type: z.literal("numeric"),
  title: z.string(),
  instructions: z.string().optional(),
  questions: z
    .array(
      z.object({
        id: Id,
        prompt: z.string(),
        answer: Expr,
        tolerance: z.number().min(0).optional(),
        unit: z.string().optional(),
      }),
    )
    .min(1),
  checks: z.array(CheckSchema).default([]),
});

export const PartSchema = z.discriminatedUnion("type", [GridPartSchema, JournalPartSchema, NumericPartSchema]);

export const ExerciseSpecSchema = z.object({
  version: z.literal(1).default(1),
  title: z.string().min(1),
  business: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  }),
  currency: z.string().default("OMR"),
  period: z.string().optional(),
  story: z.string().default(""),
  params: z.array(ParamSchema).default([]),
  transactions: z.array(z.object({ id: Id, text: z.string() })).default([]),
  parts: z.array(PartSchema).min(1),
  checks: z.array(CheckSchema).default([]),
  /** Things the AI used that are not in the course slides (shown to the doctor as warnings). */
  outOfCourse: z.array(z.string()).default([]),
  teacherNotes: z.string().optional(),
});

export type ExerciseSpec = z.infer<typeof ExerciseSpecSchema>;
export type SpecInput = z.input<typeof ExerciseSpecSchema>;
export type Part = z.infer<typeof PartSchema>;
export type GridPart = z.infer<typeof GridPartSchema>;
export type JournalPart = z.infer<typeof JournalPartSchema>;
export type NumericPart = z.infer<typeof NumericPartSchema>;
export type Param = z.infer<typeof ParamSchema>;
export type Check = z.infer<typeof CheckSchema>;
