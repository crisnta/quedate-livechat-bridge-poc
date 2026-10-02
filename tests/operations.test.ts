import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOperationsReader } from "../src/lib/operations/repository";
import { parseFilters } from "../src/lib/operations/filters";
import { localDay, formatTime } from "../src/lib/operations/time";
import { METRICS } from "../src/lib/operations/metrics";
import { redactForDisplay } from "../src/lib/operations/privacy";
import { normalizeLiveChatEvent } from "../src/lib/livechat/normalize";
import { envelopeSchema } from "../src/lib/livechat/validation";
import { persistInTransaction } from "../src/lib/events/repository";
import chat from "./fixtures/incoming-chat.json";
import event from "./fixtures/incoming-event.json";
let pool: Pool, db: EmbeddedPostgres, dir: string;
const sql: string[] = [];
const reader = createOperationsReader(async (s, p) => {
  sql.push(s);
  return pool.query(s, p);
}, "synthetic-org");
const filters = (extra: Record<string, string> = {}) =>
  parseFilters(
    new URLSearchParams({ from: "2026-10-01", to: "2026-10-02", ...extra }),
  );
async function save(payload: unknown, receipt = "2026-10-02T12:00:00Z") {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const id = await persistInTransaction(
      (s, p) => c.query(s, p),
      normalizeLiveChatEvent(envelopeSchema.parse(payload), receipt),
    );
    await c.query("COMMIT");
    return id;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  dir = await mkdtemp(join(tmpdir(), "operations-pg-"));
  db = new EmbeddedPostgres({
    databaseDir: join(dir, "data"),
    port,
    user: "postgres",
    password: "synthetic-only",
    persistent: false,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await db.initialise();
  await db.start();
  pool = new Pool({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: "synthetic-only",
    database: "postgres",
  });
  await pool.query(await readFile("db/migrations/001_initial.sql", "utf8"));
});
afterAll(async () => {
  await pool?.end();
  await db?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await pool.query("TRUNCATE bridge.webhook_events, bridge.chat_context");
  sql.length = 0;
});
it("empty coverage does not fabricate operational metrics", async () => {
  const o = await reader.overview(filters());
  expect(o.conversations).toBe(0);
  expect(o.daily).toEqual([]);
  expect((await reader.health()).last_webhook).toBeNull();
  expect(METRICS.some((m) => m.available === false)).toBe(true);
});
it("deduplicates messages and reports repeated deliveries separately", async () => {
  await save(chat);
  await save(event);
  await save(event, "2026-10-02T12:01:00Z");
  const o = await reader.overview(filters());
  expect(o.messages).toBe(1);
  expect(o.customer_messages).toBe(1);
  expect(o.repeated_deliveries).toBe(1);
  const h = await reader.health();
  expect(h.last_webhook).toBe("2026-10-02T12:01:00.000Z");
  expect(h.last_source_activity).toBe("2026-09-30T12:31:08.123Z");
});
it("lists exclude raw payloads and visitor fields; scoped SQL is parameterized", async () => {
  const c = structuredClone(chat);
  Object.assign(c.payload.chat.users[0], {
    name: "SYNTHETIC_PRIVATE_NAME",
    email: "synthetic@example.invalid",
    ip: "192.0.2.1",
  });
  await save(c);
  await save(event);
  const rows = await reader.conversations(filters());
  await reader.events(filters());
  await reader.groups(filters());
  await reader.agents(filters());
  expect(sql.join(" ")).not.toMatch(/raw_payload|SELECT \*/);
  expect(JSON.stringify(rows)).not.toMatch(
    /SYNTHETIC_PRIVATE_NAME|example.invalid|192.0.2.1|raw_payload/,
  );
  expect(
    (await reader.conversations(filters({ chat: "' OR TRUE --" }))).items,
  ).toHaveLength(0);
});
it("isolates the configured organization", async () => {
  await save(chat);
  await save({ ...chat, organization_id: "other-org" });
  expect((await reader.overview(filters())).conversations).toBe(1);
  expect((await reader.events(filters())).items).toHaveLength(1);
});
it("uses Santiago date boundaries, independent of UTC receipt day", async () => {
  await save(chat, "2026-10-02T02:30:00Z");
  const c = structuredClone(chat);
  c.payload.chat.id = "SECOND";
  await save(c, "2026-10-02T03:30:00Z");
  const first = await reader.overview(
    filters({ from: "2026-10-01", to: "2026-10-01" }),
  );
  expect(first.conversations).toBe(1);
  expect(first.hourly[0].bucket).toBe("23");
  expect(localDay(new Date("2026-10-02T02:30:00Z"))).toBe("2026-10-01");
  expect(formatTime("2026-10-02T02:30:00Z")).toContain("23:30");
});
it("retains multiple threads without multiplying chat and group counts", async () => {
  await save(chat);
  const c = structuredClone(chat);
  c.payload.chat.thread.id = "SECOND_THREAD";
  await save(c);
  await save(event);
  const o = await reader.overview(filters());
  expect(o.conversations).toBe(1);
  expect(o.threads).toBe(2);
  expect(o.groups[0].chats).toBe(1);
  expect((await reader.detail(chat.payload.chat.id))?.threads).toHaveLength(2);
  expect(
    (await reader.detail(chat.payload.chat.id, 1, "SECOND_THREAD"))?.timeline,
  ).toHaveLength(1);
});
it("unknown authors and partial messages do not imply an operational status", async () => {
  await save(event);
  const partial = structuredClone(event);
  partial.payload.event.id = "PARTIAL";
  delete (partial.payload.event as { text?: string }).text;
  await save(partial);
  const o = await reader.overview(filters());
  expect(o.pending).toBe(1);
  expect(o.unsupported).toBe(1);
  expect(o.unknown_messages).toBe(2);
  const d = await reader.detail(event.payload.chat_id);
  expect(d?.timeline[0].author_type).toBe("unknown");
  expect(d?.threads[0].users).toEqual({});
  expect(d?.threads[0].group_ids).toEqual([]);
  expect(d?.timeline.some((e) => e.text === null)).toBe(true);
});
it("reconstructs initial snapshot messages without double counting received events", async () => {
  const c = structuredClone(chat);
  (c.payload.chat.thread.events as unknown[]).push(
    { ...event.payload.event },
    { ...event.payload.event, id: "INITIAL_ONLY" },
  );
  await save(c);
  await save(event);
  const d = await reader.detail(c.payload.chat.id);
  expect(
    d?.timeline.filter((x) => x.event_id === event.payload.event.id),
  ).toHaveLength(1);
  expect(d?.timeline.find((x) => x.event_id === "INITIAL_ONLY")?.source).toBe(
    "initial_snapshot",
  );
  expect((await reader.overview(filters())).messages).toBe(1);
});
it("conversation detail keeps visitor data separate and technical payload redacts secrets", async () => {
  const c = structuredClone(chat);
  Object.assign(c.payload.chat.users[0], {
    name: "SYNTHETIC_PRIVATE_NAME",
    email: "synthetic@example.invalid",
    ip: "192.0.2.1",
  });
  const id = await save({
    ...c,
    client_secret: "DO_NOT_DISPLAY",
    access_token: "DO_NOT_DISPLAY",
  });
  expect(JSON.stringify(await reader.detail(c.payload.chat.id))).not.toMatch(
    /SYNTHETIC_PRIVATE_NAME|example.invalid|192.0.2.1|raw_payload/,
  );
  expect((await reader.visitor(c.payload.chat.id))[0].alias).toBe(
    "SYNTHETIC_PRIVATE_NAME",
  );
  expect(JSON.stringify((await reader.event(id))?.raw_payload)).not.toMatch(
    /synthetic-secret-only|DO_NOT_DISPLAY/,
  );
});
it("paginates conversations and events with stable nonoverlapping pages", async () => {
  for (let i = 0; i < 52; i++) {
    const c = structuredClone(chat);
    c.payload.chat.id = `CHAT_${String(i).padStart(3, "0")}`;
    await save(c);
  }
  const a = await reader.conversations(filters()),
    b = await reader.conversations(filters({ page: "2" }));
  expect(a.items).toHaveLength(25);
  expect(b.items).toHaveLength(25);
  expect(a.hasMore).toBe(true);
  expect(
    a.items.some((x) => b.items.some((y) => y.chat_id === x.chat_id)),
  ).toBe(false);
  const ea = await reader.events(filters()),
    eb = await reader.events(filters({ page: "2" }));
  expect(ea.items).toHaveLength(50);
  expect(eb.items).toHaveLength(2);
  expect(eb.hasMore).toBe(false);
});
it("filters observed agent responses and masks email-shaped agent IDs", async () => {
  const c = structuredClone(chat);
  c.payload.chat.users[1].id = "synthetic-agent@example.invalid";
  await save(c);
  const e = structuredClone(event);
  e.payload.event.author_id = c.payload.chat.users[1].id;
  await save(e);
  expect(
    (await reader.conversations(filters({ response: "with" }))).items,
  ).toHaveLength(1);
  expect(
    (await reader.conversations(filters({ response: "without" }))).items,
  ).toHaveLength(0);
  expect(JSON.stringify(await reader.agents(filters()))).not.toContain(
    "synthetic-agent@example.invalid",
  );
});
it("validates dates, page sizes and display redaction recursively", () => {
  expect(() => filters({ from: "2026-02-30" })).toThrow();
  expect(() => filters({ page: "0" })).toThrow();
  expect(
    redactForDisplay({
      nested: { refresh_token: "HIDDEN", secret_key: "HIDDEN" },
    }),
  ).toEqual({
    nested: { refresh_token: "[REDACTED]", secret_key: "[REDACTED]" },
  });
});
it("paginates timelines without repeated event identities", async () => {
  await save(chat);
  for (let i = 0; i < 101; i++) {
    const e = structuredClone(event);
    e.payload.event.id = "TIMELINE_" + i;
    await save(e);
  }
  const a = await reader.detail(chat.payload.chat.id, 1),
    b = await reader.detail(chat.payload.chat.id, 2);
  expect(a?.timeline).toHaveLength(100);
  expect(a?.hasMore).toBe(true);
  expect(b?.timeline).toHaveLength(2);
  expect(b?.hasMore).toBe(false);
  expect(
    a?.timeline.some((x) => b?.timeline.some((y) => x.key === y.key)),
  ).toBe(false);
});
it("Santiago uses seasonal offsets rather than a fixed UTC subtraction", () => {
  expect(localDay(new Date("2026-06-01T03:30:00Z"))).toBe("2026-05-31");
  expect(localDay(new Date("2026-10-02T03:30:00Z"))).toBe("2026-10-02");
});
