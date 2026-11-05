import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SimMonthRow, SimPlayerRow, SimRunRow } from "@/db/schema";
import { isUuid } from "@/lib/data";
import { grade } from "@/lib/spec/engine";
import { SimSpecSchema, type SimSpec } from "./schema";
import { businessScore, defaultDecisions, finalMark, monthExercise, runCompany, type MonthResult } from "./engine";
import type { Values } from "@/lib/spec/engine";

export async function loadSim(id: string) {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.sims).where(eq(schema.sims.id, id));
  if (!row) return null;
  return { row, spec: SimSpecSchema.parse(row.spec) as SimSpec };
}

export function runState(run: SimRunRow, spec: SimSpec, now = new Date()) {
  const ended = !!run.endedAt || now > run.deadline;
  return { ended, month: Math.min(run.openedMonth, spec.months), lastMonth: run.openedMonth >= spec.months };
}

export async function loadRun(runId: string) {
  if (!isUuid(runId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ run: schema.simRuns, sim: schema.sims, cls: schema.classes })
    .from(schema.simRuns)
    .innerJoin(schema.sims, eq(schema.sims.id, schema.simRuns.simId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.simRuns.classId))
    .where(eq(schema.simRuns.id, runId));
  if (!row) return null;
  return { ...row, spec: SimSpecSchema.parse(row.sim.spec) as SimSpec };
}

export async function monthRows(playerId: string) {
  const db = await getDb();
  return db.select().from(schema.simMonths).where(eq(schema.simMonths.playerId, playerId)).orderBy(schema.simMonths.month);
}

/** The company's true history from the stored decisions (months without a row are left out). */
export function companyResults(spec: SimSpec, rows: SimMonthRow[]): MonthResult[] {
  const byMonth: (Values | null)[] = [];
  const last = rows.reduce((m, r) => Math.max(m, r.month), 0);
  for (let m = 1; m <= last; m++) byMonth.push((rows.find((r) => r.month === m)?.decisions as Values) ?? null);
  return runCompany(spec, byMonth, last);
}

/** Marks available for a month's books. */
export function monthMax(spec: SimSpec, result: MonthResult) {
  const ex = monthExercise(spec, result);
  const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
  return grade(ex, params, {}).max;
}

/**
 * Before opening month `upTo + 1`: every enrolled student gets a company, and every month up to `upTo`
 * that isn't done is finished: no row → default decisions (auto, 0 marks); decided but not recorded → 0 marks.
 */
export async function autoFill(run: SimRunRow, spec: SimSpec, upTo: number) {
  const db = await getDb();
  const enrolled = await db.select({ studentId: schema.enrollments.studentId }).from(schema.enrollments).where(eq(schema.enrollments.classId, run.classId));
  const players = await db.select().from(schema.simPlayers).where(eq(schema.simPlayers.runId, run.id));
  let n = players.length;
  for (const e of enrolled) {
    if (!players.some((p) => p.studentId === e.studentId)) {
      n++;
      const [p] = await db.insert(schema.simPlayers).values({ runId: run.id, studentId: e.studentId, companyName: `Company ${n}` }).onConflictDoNothing().returning();
      if (p) players.push(p);
    }
  }
  let autoPlayed = 0;
  for (const p of players) {
    const rows = await monthRows(p.id);
    for (let m = 1; m <= upTo; m++) {
      const row = rows.find((r) => r.month === m);
      if (row?.step === "done") continue;
      const results = companyResults(spec, [...rows.filter((r) => r.month < m), ...(row ? [row] : [])].sort((a, b) => a.month - b.month));
      if (!row) {
        const decisions = defaultDecisions(spec);
        const res = runCompany(spec, [...results.map((r) => r.decisions), decisions], m);
        const max = monthMax(spec, res[m - 1]);
        const [ins] = await db
          .insert(schema.simMonths)
          .values({ playerId: p.id, month: m, decisions, step: "done", accScore: 0, accMax: max, auto: true, doneAt: new Date() })
          .onConflictDoNothing()
          .returning();
        if (ins) rows.push(ins);
        autoPlayed++;
      } else {
        const max = monthMax(spec, results[m - 1]);
        await db
          .update(schema.simMonths)
          .set({ step: "done", accScore: 0, accMax: max, doneAt: new Date() })
          .where(and(eq(schema.simMonths.playerId, p.id), eq(schema.simMonths.month, m)));
        row.step = "done";
        autoPlayed++;
      }
      rows.sort((a, b) => a.month - b.month);
    }
  }
  return autoPlayed;
}

export interface Standing {
  player: SimPlayerRow;
  email: string;
  monthsDone: number;
  autoMonths: number;
  accScore: number;
  accMax: number;
  business: { raw: number; pct: number };
  mark: number;
  rank: number;
}

export async function leaderboard(run: SimRunRow, spec: SimSpec): Promise<Standing[]> {
  const db = await getDb();
  const players = await db
    .select({ player: schema.simPlayers, email: schema.users.email })
    .from(schema.simPlayers)
    .innerJoin(schema.users, eq(schema.users.id, schema.simPlayers.studentId))
    .where(eq(schema.simPlayers.runId, run.id));
  const ids = players.map((p) => p.player.id);
  const allRows = ids.length ? await db.select().from(schema.simMonths).where(inArray(schema.simMonths.playerId, ids)) : [];
  const out = players.map(({ player, email }) => {
    const rows = allRows.filter((r) => r.playerId === player.id && r.step === "done").sort((a, b) => a.month - b.month);
    const contiguous: SimMonthRow[] = [];
    for (const r of rows) if (r.month === contiguous.length + 1) contiguous.push(r);
    const results = companyResults(spec, contiguous);
    const accScore = contiguous.reduce((s, r) => s + (r.accScore ?? 0), 0);
    const accMax = contiguous.reduce((s, r) => s + (r.accMax ?? 0), 0);
    const business = results.length ? businessScore(spec, results) : { raw: 0, pct: 0 };
    return {
      player,
      email,
      monthsDone: contiguous.length,
      autoMonths: contiguous.filter((r) => r.auto).length,
      accScore,
      accMax,
      business,
      mark: finalMark(accScore, accMax, business.pct, run.accountingWeight),
      rank: 0,
    };
  });
  out.sort((a, b) => b.mark - a.mark || b.business.raw - a.business.raw);
  out.forEach((s, i) => (s.rank = i > 0 && out[i - 1].mark === s.mark ? out[i - 1].rank : i + 1));
  return out;
}
