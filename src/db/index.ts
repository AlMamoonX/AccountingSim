import path from "node:path";
import fs from "node:fs";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __accsimDb?: Promise<Db> };

/**
 * Production (Docker on the VPS): DATABASE_URL points at PostgreSQL.
 * Local development without Postgres: an embedded Postgres (PGlite) stored in ./data/pglite.
 * Migrations in ./drizzle run automatically the first time the database is opened.
 */
async function open(): Promise<Db> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.join(dataDir(), "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}

export function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

export function getDb(): Promise<Db> {
  if (!g.__accsimDb) {
    g.__accsimDb = open().catch((e) => {
      g.__accsimDb = undefined;
      throw e;
    });
  }
  return g.__accsimDb;
}

export { schema };
