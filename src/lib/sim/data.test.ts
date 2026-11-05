import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/db";
import { karakSim } from "./fixtures/karakSim";
import { SimSpecSchema, type SimMonthWork } from "./schema";
import { defaultDecisions, monthExercise, runCompany } from "./engine";
import { grade, perfectAnswers } from "@/lib/spec/engine";
import { autoFill, companyResults, leaderboard, loadRun, monthRows } from "./data";
import { applyMonthWork, startCompany } from "@/app/actions/sim";

let database: Db;
let teacher: typeof schema.users.$inferSelect;
let student: typeof schema.users.$inferSelect;
const client = new PGlite();
const spec = SimSpecSchema.parse(karakSim);

vi.mock("@/db", async () => ({ schema: await import("@/db/schema"), getDb: async () => database }));
vi.mock("@/lib/auth", () => ({ requireTeacher: async () => teacher, requireStudent: async () => student }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai/simGenerate", () => ({ generateMonthWork: vi.fn(), generateSim: vi.fn(), reviseSim: vi.fn(), simWarnings: vi.fn() }));

beforeAll(async () => {
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  database = db as unknown as Db;
}, 30000);
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  await client.exec('TRUNCATE "users" CASCADE');
  [teacher, student] = await database.insert(schema.users).values([
    { email: "teacher@example.test", role: "teacher" },
    { email: "student@example.test", role: "student" },
  ]).returning();
});

async function game(openedMonth = 1, deadline = new Date(Date.now() + 86400_000)) {
  const [cls] = await database.insert(schema.classes).values({ teacherId: teacher.id, name: "Test class", joinCode: "TEST" }).returning();
  await database.insert(schema.enrollments).values({ classId: cls.id, studentId: student.id });
  const [sim] = await database.insert(schema.sims).values({ ownerId: teacher.id, title: spec.title, spec, status: "published" }).returning();
  const [run] = await database.insert(schema.simRuns).values({ simId: sim.id, classId: cls.id, deadline, openedMonth }).returning();
  return { cls, sim, run };
}

const plan = (month: number): SimMonthWork => ({
  month, title: "Inventory focus", instructions: "Calculate the value of closing inventory.",
  parts: [{ id: "InventoryWork", type: "numeric", title: "Inventory", questions: [{ id: "closing", prompt: "Closing inventory value?", answer: "inventory_end" }], checks: [] }],
});

describe("simulation persistence and deadlines", () => {
  it("auto-plays skipped months, retains locked decisions and leaves submitted marks alone", async () => {
    const { run } = await game(3);
    const [p] = await database.insert(schema.simPlayers).values({ runId: run.id, studentId: student.id, companyName: "My company" }).returning();
    const locked = { ...defaultDecisions(spec), takeLoan: 1 };
    await database.insert(schema.simMonths).values({ playerId: p.id, month: 1, decisions: locked, step: "record" });
    expect(await autoFill(run, spec, 2)).toBe(2);
    const rows = await monthRows(p.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.auto && r.step === "done" && r.accScore === 0 && r.accMax! > 0)).toBe(true);
    expect(rows[0].decisions).toEqual(locked);
    expect(companyResults(spec, rows)[1].opening).toEqual(companyResults(spec, rows)[0].closing);
    expect(await autoFill(run, spec, 2)).toBe(0);
    await database.update(schema.simMonths).set({ auto: false, accScore: 7 }).where(eq(schema.simMonths.month, 1));
    await autoFill(run, spec, 2);
    expect((await monthRows(p.id))[0].accScore).toBe(7);
  });

  it("finalizes all opened months at the deadline, including students without companies", async () => {
    const { run } = await game(3, new Date(Date.now() - 1000));
    const loaded = await loadRun(run.id);
    expect(loaded!.run.endedAt).toEqual(run.deadline);
    const board = await leaderboard(loaded!.run, loaded!.spec);
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ monthsDone: 3, autoMonths: 3, accScore: 0 });
    expect((await loadRun(run.id))!.run.endedAt).toEqual(run.deadline);
    expect((await monthRows(board[0].player.id))).toHaveLength(3);
  });

  it("lets a late joiner name a company and start the current month with prior months settled", async () => {
    const { run } = await game(3);
    const fd = new FormData(); fd.set("companyName", "Late bakery");
    await startCompany(run.id, fd);
    const [p] = await database.select().from(schema.simPlayers).where(eq(schema.simPlayers.runId, run.id));
    expect(p.companyName).toBe("Late bakery");
    expect((await monthRows(p.id)).map((r) => r.month)).toEqual([1, 2]);
  });
});

describe("teacher changes to upcoming monthly coursework", () => {
  it("applies a plan to just this run and preserves previous marks and company results", async () => {
    const { run } = await game(2);
    await autoFill(run, spec, 1);
    const before = (await leaderboard(run, spec))[0];
    const beforeRows = await monthRows(before.player.id);
    const [otherRun] = await database.insert(schema.simRuns).values({ simId: run.simId, classId: run.classId, deadline: run.deadline }).returning();
    expect(await applyMonthWork(run.id, plan(3))).toEqual({ ok: true });
    const loaded = await loadRun(run.id);
    expect(loaded!.spec.monthWork).toEqual([plan(3)]);
    expect((await loadRun(otherRun.id))!.spec.monthWork).toEqual([]);
    expect(await monthRows(before.player.id)).toEqual(beforeRows);
    expect(companyResults(loaded!.spec, beforeRows)).toEqual(companyResults(spec, beforeRows));
    const result = runCompany(loaded!.spec, [], 3)[2];
    const ex = monthExercise(loaded!.spec, result);
    const params = Object.fromEntries(ex.params.map((p) => [p.name, p.value]));
    expect(ex.parts.map((p) => p.title)).toEqual(["Inventory"]);
    expect(grade(ex, params, perfectAnswers(ex, params))).toMatchObject({ score: 1, max: 1 });
  });

  it("rejects current or earlier months, unknown formulas and plans applied after the month opens", async () => {
    const { run } = await game(2);
    expect((await applyMonthWork(run.id, plan(1))).ok).toBe(false);
    expect((await applyMonthWork(run.id, plan(2))).ok).toBe(false);
    const bad = plan(3); bad.parts[0] = { id: "Q", type: "numeric", title: "Unknown", questions: [{ id: "q", prompt: "?", answer: "inventedName" }], checks: [] };
    expect((await applyMonthWork(run.id, bad)).ok).toBe(false);
    await database.update(schema.simRuns).set({ openedMonth: 3 }).where(eq(schema.simRuns.id, run.id));
    expect((await applyMonthWork(run.id, plan(3))).ok).toBe(false);
    expect((await loadRun(run.id))!.spec.monthWork).toEqual([]);
  });
});
