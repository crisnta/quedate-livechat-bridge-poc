// Synthetic full HTTP test. Never reads a supplied DATABASE_URL.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
async function freePort() {
  const s = createServer();
  await new Promise<void>((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, "127.0.0.1", resolve);
  });
  const p = (s.address() as { port: number }).port;
  await new Promise<void>((r, j) => s.close((e) => (e ? j(e) : r())));
  return p;
}
const dir = await mkdtemp(join(tmpdir(), "bridge-http-"));
const dbPort = await freePort(),
  appPort = await freePort();
const db = new EmbeddedPostgres({
  databaseDir: join(dir, "data"),
  port: dbPort,
  user: "postgres",
  password: "synthetic-only",
  persistent: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let app: ChildProcess | undefined,
  pool: Pool | undefined,
  appOutput = "";
try {
  await db.initialise();
  await db.start();
  pool = new Pool({
    host: "127.0.0.1",
    port: dbPort,
    user: "postgres",
    password: "synthetic-only",
    database: "postgres",
  });
  await pool.query(await readFile("db/migrations/001_initial.sql", "utf8"));
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: `postgresql://postgres:synthetic-only@127.0.0.1:${dbPort}/postgres`,
        LIVECHAT_WEBHOOK_SECRET: "synthetic-secret-only",
        LIVECHAT_ORGANIZATION_ID: "synthetic-org",
        LIVECHAT_INCOMING_CHAT_WEBHOOK_ID: "synthetic-chat-hook",
        LIVECHAT_INCOMING_EVENT_WEBHOOK_ID: "synthetic-event-hook",
        LIVECHAT_TEST_GROUP_ID: "999999",
        WEBHOOK_INGESTION_ENABLED: "true",
        WEBHOOK_LAB_USERNAME: "synthetic-user",
        WEBHOOK_LAB_PASSWORD: "synthetic-lab-pass",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  app.stdout?.on("data", (x) => {
    appOutput += x;
  });
  app.stderr?.on("data", (x) => {
    appOutput += x;
  });
  const base = `http://127.0.0.1:${appPort}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/webhook-lab")).status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Next.js server did not start");
  const auth = {
    authorization:
      "Basic " +
      Buffer.from("synthetic-user:synthetic-lab-pass").toString("base64"),
  };
  const post = async (body: unknown) =>
    fetch(base + "/api/webhooks/livechat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const chat = JSON.parse(
    await readFile("tests/fixtures/incoming-chat.json", "utf8"),
  );
  const event = JSON.parse(
    await readFile("tests/fixtures/incoming-event.json", "utf8"),
  );
  assert.equal((await post(chat)).status, 200);
  const r = await post(event);
  assert.equal(r.status, 200);
  const { id } = await r.json();
  await Promise.all([post(event), post(event)]);
  const rows = (
    await pool.query("SELECT * FROM bridge.webhook_events ORDER BY action")
  ).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].delivery_count, 3);
  assert.equal(rows[1].author_type, "customer");
  const unauth = await fetch(base + "/webhook-lab/" + id);
  assert.equal(unauth.status, 401);
  assert.match(unauth.headers.get("www-authenticate") ?? "", /Basic/);
  const page = await fetch(base + "/webhook-lab", { headers: auth });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /PRUEBA WEBHOOK 001/);
  assert.match(html, /incoming_chat/);
  assert.match(html, /incoming_event/);
  assert(!html.includes("synthetic-secret-only"));
  const detail = await fetch(base + "/webhook-lab/" + id, { headers: auth });
  assert.equal(detail.status, 200);
  const detailHtml = await detail.text();
  assert.match(detailHtml, /REDACTED/);
  assert(!detailHtml.includes("synthetic-secret-only"));
  const filtered = await fetch(base + "/webhook-lab?chat_id=NOT_PRESENT", {
    headers: auth,
  });
  assert(!(await filtered.text()).includes("PRUEBA WEBHOOK 001"));
  const bad = await post({ ...event, secret_key: "incorrect" });
  assert.equal(bad.status, 403);
  // PostgreSQL stopped, not just a mock rejection: no success ACK permitted.
  await pool.end();
  pool = undefined;
  await db.stop();
  assert.equal((await post(event)).status, 503);
  console.log(
    "HTTP PASS: two fixtures → real Next endpoint → PostgreSQL → protected list/detail; duplicates, filter, secret redaction, 401, 403 and database-offline 503.",
  );
} catch (e) {
  console.error(
    "HTTP smoke failed:",
    e instanceof Error ? e.message : "unknown error",
  );
  if (appOutput) console.error(appOutput);
  process.exitCode = 1;
} finally {
  if (app && app.exitCode === null) {
    const exited = once(app, "exit");
    app.kill("SIGTERM");
    await exited;
  }
  await pool?.end();
  await db.stop();
  await rm(dir, { recursive: true, force: true });
}
