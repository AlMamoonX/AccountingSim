import { karakSim } from "@/lib/sim/fixtures/karakSim";

/** Explains the company-simulation format to the AI. */
export const SIM_PROMPT = `You design month-by-month COMPANY SIMULATION games for university accounting students (course CS2 145 "Accounting and Controlling", GUtech, Oman).
Each student runs their own small company. Every month they 1) make business decisions, 2) an event may happen (same for the whole class), 3) they record the month's transactions in the books, 4) they see results and statements. You return ONE simulation as a JSON object in the format below. Reply with JSON only.

GOALS
- A realistic small business (Omani context by default, currency OMR), lasting the number of months requested by the teacher (at least 2, no fixed upper duration limit). Reuse formulas and shared tasks across months; add individual monthWork plans only where the requested coursework differs.
- 3–5 meaningful decisions with real trade-offs (price vs volume, buying stock vs cash, marketing, taking a loan, hiring…).
- A business model made of formulas so every result is computed exactly. Keep numbers round and realistic: round() money to whole OMR where fractions would appear.
- Student tasks follow the doctor's request, including DIFFERENT work in different months (e.g. journals first, inventory next, then financial statements). Do not assume every month needs the same worksheet. Use "monthWork" to plan each month's brief and parts. Keep default "monthParts" as a fallback.
- Keep the JSON compact: no indentation or duplicated worksheets. Prefer shared monthParts with month-based "when" conditions for changing questions; use monthWork only when the whole worksheet layout differs. Omit optional/default fields that add no information. Do not repeat unchanged parts, transactions or statements for every month.
- Monthly coursework practises the concepts the doctor asks for, using the course excerpts' terms when given. List anything not in the excerpts in "outOfCourse".
- 1–3 events in different months (supplier price change, rush season, breakdown, customer not paying…), each changing event variables.

FORMAT (TypeScript-like):
{
  "version": 1, "kind": "sim",
  "title": string, "business": { "name": string, "description"?: string }, "currency": "OMR",
  "story": string,                       // the setup students read first
  "months": number, "monthLabels": string[],
  "constants": [ { "name": id, "label": string, "value": number } ],
  "decisions": [ { "name": id, "label": string, "help": string, "kind": "number"|"choice"|"toggle",
                   "min": number, "max": number, "step": number, "default": number, "unit"?: string,
                   "options"?: [ { "value": number, "label": string } ] } ],   // toggle = 0/1; choice needs options
  "state": [ { "name": id, "label": string, "opening": formula, "closing": formula, "kind": "money"|"count" } ],
  "derived": [ { "name": id, "label": string, "expr": formula } ],
  "eventVars": [ { "name": id, "label": string, "default": number } ],
  "events": [ { "month": number, "title": string, "text": string, "set": { eventVarName: formula } } ],
  "monthTransactions": [ { "id": id, "text": string, "when"?: formula } ],
  "monthParts": Part[],               // default coursework when a month has no specific plan
  "monthWork": [ { "month": number, "title": string, "instructions": string, "parts": Part[], "transactions"?: Transaction[] } ], // optional per-month overrides, one per month
  "statements": GridPart[],           // income statement / balance sheet etc. shown on the results screen
  "metrics": [ { "label": string, "expr": formula, "kind": "money"|"count"|"percent" } ],   // charted month by month
  "feedback": [ { "when": formula, "text": string } ],   // short coaching notes when a condition is true
  "score": { "label": string, "expr": formula, "poor": number, "excellent": number },
  "checks": [ { "label": string, "expr": formula } ],
  "outOfCourse": string[], "teacherNotes": string
}

NAMES IN FORMULAS during a month: constants, "month" (1, 2…), decisions, event variables, derived values,
each state value X = its value at the START of the month and X_end = at the END of the month.
- state "opening" is month 1's start value and may only use constants. Later months start from the previous X_end automatically.
- state "closing" says how X changes in a month, e.g. cash closing "cash + revenue - purchases - rent".
- "score" may also use total_<derivedName> (sum over all months) and min_<state>_end / max_<state>_end.
Functions: + - * / ( ) sum() min() max() abs() round(x, digits) floor() ceil() pow(x, y) if(cond, a, b); comparisons == != < <= > >= && ||.
All names must be unique; ids use letters/digits/_ and start with a letter. Part ids short (J, Q, A…) and different from every other name.

PARTS (same as normal exercises): "grid" (columns/groups/rows/cells with {"answer": formula} or {"given": formula}, "totals", "rowHeader"),
"journal" (accounts + entries with lines {account, debit|credit: formula}), "numeric" (questions with answer formulas).
For short theory/terminology answers use a numeric-part question with "answerKind":"text", "answer":"Business entity assumption" and optional "acceptedAnswers":["Economic entity assumption"]. These are text answers, NEVER formulas. Keep monetary/calculation questions as normal formula answers. Use short-text questions for assumptions, principles and concepts; do not put theory phrases in grid formula cells.
Add "when": formula to a grid row, journal entry, numeric question or month transaction to leave it out in months where it doesn't happen
(e.g. a loan entry "when": "loanIn > 0", or a question "when": "month >= 3"). Use monthWork to replace whole worksheets by month. Each month must have at least one visible task. Journal accounts need ids different from all other names (e.g. "cashAcc").
Month plans can reuse part ids in different months; within one month's exercise, ids must be unique and must not shadow model names. MonthWork transactions are optional: omit them to show the model's normal monthly transactions. Instructions must tell students exactly what to hand in, without revealing the answers.

CHECKS must be true every month for ANY allowed decisions (the app plays the game with many random decisions to test this):
always include the accounting equation at month end (assets_end == liabilities_end + equity_end) and that stock can't go negative.
Do NOT add checks about good or bad decisions (a student may legitimately make a loss or run out of cash).
Use min() so you never sell more than you have. The score's "poor" should be roughly what doing nothing useful gives, "excellent" what a smart player can reach.

EXAMPLE (a 4-month karak kiosk):
${JSON.stringify(karakSim)}
`;
