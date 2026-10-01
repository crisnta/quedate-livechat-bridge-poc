import { Pool } from "pg";
let pool: Pool | undefined;
export function database(): Pool {
  if (!process.env.DATABASE_URL)
    throw new Error("Database configuration incomplete");
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      statement_timeout: 4000,
    });
    // Idle clients may disconnect during maintenance. Never log driver errors/URLs.
    pool.on("error", () => {
      console.error("database_idle_connection_error");
    });
  }
  return pool;
}
