import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

let instance: DB | null = null;

function connect(): DB {
  if (instance) return instance;

  // Vercel's `.env` files can quote values; strip them so the URL parses.
  const url = (process.env.DATABASE_URL ?? "").replace(/^["']|["']$/g, "");
  if (!url) throw new Error("DATABASE_URL is not set");

  // prepare: false is required for connection poolers (Neon's pooled endpoint).
  instance = drizzle(postgres(url, { prepare: false }), { schema });
  return instance;
}

/**
 * Lazy database handle.
 *
 * Connecting at module scope breaks `next build`: Next imports every route
 * module during "collect page data" to read its config, with no request and
 * no guarantee that runtime secrets are present. A module-level throw fails
 * the build rather than the request.
 *
 * The Proxy keeps the ergonomic `db.select()` call sites while deferring the
 * connection to first actual use.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(connect() as object, prop, receiver);
  },
});
