# Handoff: Company Simulation ("game sim") — work in progress

Last updated: 2026-11-05. Repo: https://github.com/AlMamoonX/AccountingSim (branch `main`).

## Where things stand

The main app (AI exercises, 15 Karak Pop pages, sign-in, marking, Excel, Docker) is **done and working**. See [README.md](README.md) and [pages.md](pages.md).

The **company simulation** is now **built and partly tested in the browser**:

- Doctor: Simulations tab, add the sample sim, review with Overview / Test play / Edit, give to a class, control room. Verified.
- Student: name company → Decide → Record → Results (marks + statements + feedback + leaderboard). Verified for one month.
- Not yet verified: "Open next month" with auto-play, the end-of-sim final page, the Excel export, a real DeepSeek sim generation.

`npm test`: 28 tests pass. `npx tsc --noEmit` is clean.

## What the sim is (decided with the user)

| Topic | Choice |
|---|---|
| Month loop | Decide → event → record the books → results, then next month |
| Opponents | Solo company per student + class leaderboard (company names only; doctor sees emails) |
| Book mistakes | Lose marks, but next month starts from the **correct** books |
| Final mark | Accounting accuracy + business performance; doctor sets the weight (default 70% accounting) |
| Decisions | AI picks them (number with min/max/step, choice, toggle); doctor edits |
| Pace | **Doctor opens each month** for the whole class |
| Events | AI-written, same event in the same month for everyone |
| Results screen | SVG charts over months, real statements, feedback notes, leaderboard rank |
| Missed month | When the doctor opens the next month, unfinished months are auto-played on default decisions with 0 accounting marks |
| Business score | AI formula with `poor` / `excellent` reference values (normalised 0–1) |
| Placement | New **Simulations** section with its own top-bar tab |

Full plan: the "Company Simulation" plan in the Claude plans folder; summary below.

## Done

- `src/lib/spec/expr.ts`: added `floor()`, `ceil()`, `pow()`.
- `src/lib/spec/schema.ts` + `engine.ts`: optional `when` on grid rows, journal entries, numeric questions and transactions. `effectiveSpec()` drops items whose `when` is 0. It runs inside `buildView`, `grade` and `perfectAnswers`, and `analyze` validates the `when` formulas.
- `src/lib/sim/schema.ts`: `SimSpecSchema` (constants, decisions, state with `opening`/`closing`, derived, eventVars, events, monthTransactions, monthParts, statements, metrics, feedback, score, checks).
- `src/lib/sim/engine.ts`:
  - `simulateMonth`, `runCompany` (chains true closing → next opening; `null` month = default decisions = auto-play), `monthExercise` (a month as a normal `ExerciseSpec`, so the existing `grade` / `buildView` / `Sheet` work), `statementsView`.
  - `businessScore` (extra names `total_X`, `min_X_end`, `max_X_end`), `finalMark`.
  - `validateDecisions`, `defaultDecisions`, `randomDecisions`.
  - `analyzeSim` plays defaults + 20 random games and checks every formula and check.
- `src/lib/sim/fixtures/karakSim.ts`: 4-month karak kiosk sample (weighted-average inventory, depreciation, loan + interest, 3 events). Score: poor 5,000, excellent 12,000.
- `src/lib/sim/engine.test.ts`: chaining, determinism, auto-play, `when`, full marks, statements, scores, decision rules, broken sims, calibration.
- `src/db/schema.ts` + `drizzle/0001_sims.sql`: tables `sims`, `sim_versions`, `sim_runs` (`opened_month`, `deadline`, `accounting_weight`, `ended_at`), `sim_players` (`company_name`, unique per run+student), `sim_months` (pk player+month; `decisions`, `answers`, `step` record|done, `acc_score`, `acc_max`, `auto`). A month with no row = the student hasn't decided yet.
- `src/lib/ai/generate.ts`: `runWithRepair<T>(messages, kind, schema, check, id, what)` is now generic; `courseContextFor(query, useLibrary)` is exported.
- `src/lib/ai/simPrompt.ts` (`SIM_PROMPT`, includes the sample as the example) and `src/lib/ai/simGenerate.ts` (`generateSim`, `reviseSim`, `simProblems`, `simWarnings`). Not yet run against real DeepSeek.

## Original build list (steps 1–4 are now DONE: see "Remaining" at the end)

1. **`src/lib/sim/data.ts`**
   - `loadSim(id)`.
   - `loadGame(runId, studentId)`: run + sim spec + player + month rows.
   - `companyResults(spec, rows)`: `runCompany` with each row's decisions.
   - `autoFill(runId, monthsBefore)`: creates players for enrolled students who have none (name e.g. "Company 3"). For every player and every month < opened month: no row → insert defaults, `auto = true`, `step = done`, `acc_score = 0`, `acc_max` = that month's books max. Row still at `record` → `done` with 0.
   - `leaderboard(run, spec)`: per player accounting total, `businessScore` over finished months, `finalMark`; sorted.
2. **`src/app/actions/sim.ts`** (pattern: `src/app/actions/teacher.ts` / `student.ts`, with `requireTeacher` / `requireStudent`).
   - Doctor: `generateSimAction(fd)`, `addSampleSim()`, `saveSim(id, json)`, `reviseSimAction`, `publishSim`, `copySim`, `deleteSim`, `restoreSimVersion`, `createSimRun(fd)`, `openNextMonth(runId)` (calls `autoFill`, then `opened_month + 1`; can't pass `spec.months`), `endRun`, `changeRunDeadline`.
   - Student: `startCompany(runId, name)`, `lockDecisions(runId, raw)` (only for `opened_month`, `validateDecisions`, insert row step `record`), `submitMonthBooks(runId, answers)` (grade `monthExercise` → `acc_score`/`acc_max`, step `done`).
   - The event and books are revealed only after decisions are locked; the corrections only after hand-in. Nothing is accepted after `deadline` / `ended_at`.
3. **Doctor pages** (Karak Pop, reuse `src/components/ui/*`, `Sheet`, `ResultSheet`, `AiWorking`, `ChoiceGroup`):
   - `/t/sims`: list + Create + "Add the sample sim".
   - `/t/sims/new`: like `src/app/t/exercises/new/CreateForm.tsx`. **Use `onSubmit`, not `action=`**, so the loader shows.
   - `/t/sims/[id]`:
     - tabs Overview / **Test play** (decision controls → `runCompany` client-side → charts + statements + answer key per month) / Edit / versions + "Ask the AI to change it".
     - For Edit: small tables for constants, decisions, state, derived, events, feedback, metrics, score. Reuse `SpecEditor` for `monthParts` by passing a pseudo `ExerciseSpec` with month-1 values as params; add a prop to hide its business/amounts sections. Advanced JSON at the end.
   - `/t/sims/[id]/assign`: class, deadline, accounting weight.
   - `/t/sim-runs/[id]` control room: Open month N+1 with a confirm showing how many get auto-played, leaderboard with emails, progress, Excel (`exceljs`, like `src/app/t/assignments/[id]/export/route.ts`).
   - `/t/sim-runs/[id]/students/[sid]`.
   - Add a "Simulations" link in `src/components/ui/NavLinks.tsx`.
4. **Student pages**:
   - Sim cards on `src/app/s/page.tsx`.
   - `/s/sims/[runId]`: name company → stepper Decide / Event / Record / Results.
   - `/s/sims/[runId]/final`.
   - New components in `src/components/sim/`: `DecisionForm`, `EventCard`, `LineChart` (plain SVG, design tokens), `Stepper`, `Leaderboard`.
5. Update `pages.md` and `README.md` with the new pages.
6. **Verify:**
   - `npm test`, `npx tsc --noEmit`, `npm run build`.
   - Browser: doctor adds the sample sim → assigns; student plays month 1; a second student skips; doctor opens month 2 → auto-play shows; leaderboard; final page; Excel.
   - One real DeepSeek run ("a bakery in Nizwa, 4 months, inventory and a loan") must pass `analyzeSim`.
7. Commit and push.

## Dev notes (gotchas)

- **Run:** `npm run dev`. Locally the sign-in code **0000** works for any allowed email (dev mode only). The DeepSeek key is in `.env.local` (git-ignored; never put keys in `.env.example`).
- **New migrations** only apply when the database is first opened, so **restart the dev server** after `npm run db:generate`. The first start in the OneDrive folder takes about 12 s while the embedded database opens.
- `next build` and `next dev` share `.next`: stop the dev server before building.
- React 19: state updates inside a form `action=` function don't render until it finishes. Use `onSubmit` + `preventDefault` for forms that show a loading state.
- Popovers inside dark (`.card.ink`) cards need `color: var(--ink)` (already in CSS).
- The shell safety check blocks heredocs containing `find … -delete`: write such files with the editor instead.
- The GitHub connector in Claude is broken (no token). Pushing works through Git Credential Manager (`git push`).
- Teacher accounts share all classes/exercises. Teacher emails come from `TEACHER_EMAILS`; students are `@student.gutech.edu.om`.

## Remaining (as of the last push)

- Browser-test: the doctor opens February and March (a skipped month must show as auto-played with 0 book marks), "End the simulation now" → the student final page, the Excel download.
- One real DeepSeek run on `/t/sims/new` ("a bakery in Nizwa, 4 months, inventory and a loan"); it must pass `analyzeSim`.
- Update `pages.md` + `README.md` with the Simulations pages. The final results are shown on `/s/sims/[runId]` once the run has ended; there's no separate `/final` page.
- `npm run build` (stop the dev server first), commit, push.
