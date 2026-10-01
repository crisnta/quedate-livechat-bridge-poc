import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { database } from "../src/lib/db/client";
loadEnvConfig(process.cwd());
let pool: Pool | undefined;
try {
  pool = database();
  await pool.query(await readFile("db/migrations/001_initial.sql", "utf8"));
  console.log("Migration 001 applied.");
} catch {
  console.error(
    "Migration failed. Check DATABASE_URL, role permissions and connectivity.",
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
