/**
 * Applies supabase/migrations/*.sql, in order, once each. Usage: npx tsx scripts/db-migrate.mts
 * Reads DATABASE_URL from the environment (run `set -a; . ./.env.local; set +a` first).
 * Only ever touches the `kasauti` schema.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "../lib/db";

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const p = pool();
await p.query("create schema if not exists kasauti");
await p.query("create table if not exists kasauti.migrations (name text primary key, applied_at timestamptz not null default now())");
const done = new Set((await p.query("select name from kasauti.migrations")).rows.map((r) => r.name as string));
for (const f of files) {
  if (done.has(f)) {
    console.log("skip ", f);
    continue;
  }
  const client = await p.connect();
  try {
    await client.query("begin");
    await client.query(readFileSync(path.join(dir, f), "utf8"));
    await client.query("insert into kasauti.migrations (name) values ($1)", [f]);
    await client.query("commit");
    console.log("apply", f);
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    console.error("FAILED", f, e instanceof Error ? e.message : e);
    process.exitCode = 1;
    break;
  } finally {
    client.release();
  }
}
await p.end();
