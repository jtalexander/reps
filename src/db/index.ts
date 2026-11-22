import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as baseSchema from "./schema";
import * as teachSchema from "./teach-schema";

const schema = { ...baseSchema, ...teachSchema };

export type Db = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString, max: 5 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool };
}

// One pool per server process (survives dev hot reloads).
const globalForDb = globalThis as unknown as { __repsDb?: { db: Db; pool: Pool } };

function getGlobal() {
  if (!globalForDb.__repsDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
    globalForDb.__repsDb = createDb(url);
  }
  return globalForDb.__repsDb;
}

/** Lazily-connected app database. Importing this never opens a connection. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getGlobal().db as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
