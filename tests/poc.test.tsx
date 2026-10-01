import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { createWebhookHandler } from "../src/lib/livechat/handler";
import { normalizeLiveChatEvent } from "../src/lib/livechat/normalize";
import { envelopeSchema, redact } from "../src/lib/livechat/validation";
import { persistInTransaction } from "../src/lib/events/repository";
import { EventList } from "../src/components/event-list";
import { PayloadViewer } from "../src/components/payload-viewer";
import { proxy } from "../src/proxy";
import type { Normalized } from "../src/lib/events/types";
import chat from "./fixtures/incoming-chat.json";
import event from "./fixtures/incoming-event.json";
const config = {
  secret: "synthetic-secret-only",
  organization: "synthetic-org",
  chatWebhook: "synthetic-chat-hook",
  eventWebhook: "synthetic-event-hook",
  enabled: true,
};
const clone = <T,>(v: T): T => structuredClone(v);
const request = (value: unknown) =>
  new Request("http://localhost/api/webhooks/livechat", {
    method: "POST",
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
const normalized = (value: unknown) =>
  normalizeLiveChatEvent(envelopeSchema.parse(value), new Date().toISOString());
let db: EmbeddedPostgres, pool: Pool, dir: string;
async function save(n: Normalized) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const id = await persistInTransaction((s, p) => c.query(s, p), n);
    await c.query("COMMIT");
    return id;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const handler = createWebhookHandler(() => config, save);
beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  dir = await mkdtemp(join(tmpdir(), "bridge-pg-"));
  db = new EmbeddedPostgres({
    databaseDir: join(dir, "data"),
    port,
    user: "postgres",
    password: "synthetic-local-only",
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
    password: "synthetic-local-only",
    database: "postgres",
    max: 5,
  });
  await pool.query(await readFile("db/migrations/001_initial.sql", "utf8"));
});
afterAll(async () => {
  await pool?.end();
  await db?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await pool.query("TRUNCATE bridge.webhook_events,bridge.chat_context");
});
describe("Webhook → PostgreSQL", () => {
  for (const [field, value] of [
    ["secret_key", "bad"],
    ["organization_id", "bad"],
    ["webhook_id", "bad"],
  ] as const) {
    it(`rejects incorrect ${field}`, async () => {
      expect((await handler(request({ ...chat, [field]: value }))).status).toBe(
        403,
      );
      expect(
        (await pool.query("SELECT * FROM bridge.webhook_events")).rowCount,
      ).toBe(0);
    });
  }
  it("rejects invalid JSON", async () => {
    expect((await handler(request("{"))).status).toBe(400);
  });
  it("rejects unexpected action", async () => {
    expect(
      (await handler(request({ ...chat, action: "chat_transferred" }))).status,
    ).toBe(400);
  });
  it("rejects body over limit", async () => {
    expect((await handler(request("x".repeat(1024 * 1024 + 1)))).status).toBe(
      413,
    );
  });
  it("fails closed when ingestion disabled", async () => {
    const h = createWebhookHandler(() => ({ ...config, enabled: false }), save);
    expect((await h(request(chat))).status).toBe(503);
  });
  it("persists incoming_chat and technical context", async () => {
    expect((await handler(request(chat))).status).toBe(200);
    const r = (await pool.query("SELECT * FROM bridge.webhook_events")).rows[0];
    expect(r.action).toBe("incoming_chat");
    expect(r.event_id).toBeNull();
    expect(r.normalization_status).toBe("normalized");
    const c = (await pool.query("SELECT * FROM bridge.chat_context")).rows[0];
    expect(c.users).toEqual({
      CUSTOMER_SYNTH_001: "customer",
      AGENT_SYNTH_001: "agent",
    });
    expect(c.group_ids).toEqual([999999]);
  });
  it("persists incoming_event with customer and agent authors", async () => {
    await handler(request(chat));
    await handler(request(event));
    const agent = clone(event);
    agent.payload.event.id = "AGENT_EVENT";
    agent.payload.event.author_id = "AGENT_SYNTH_001";
    await handler(request(agent));
    const r = (
      await pool.query(
        "SELECT * FROM bridge.webhook_events WHERE action='incoming_event' ORDER BY event_id",
      )
    ).rows;
    expect(r.map((x) => x.author_type)).toEqual(["agent", "customer"]);
    expect(r[1].text).toBe("PRUEBA WEBHOOK 001");
    expect(r[1].normalization_version).toBe(1);
  });
  it("keeps message without text with diagnostic", async () => {
    const p = clone(event);
    delete (p.payload.event as { text?: string }).text;
    await handler(request(p));
    const r = (await pool.query("SELECT * FROM bridge.webhook_events")).rows[0];
    expect(r.text).toBeNull();
    expect(r.normalization_status).toBe("unsupported_shape");
    expect(r.normalization_errors).toContain("message_without_text");
  });
  it("keeps unknown author pending and does not guess by email shape", async () => {
    const p = clone(event);
    p.payload.event.author_id = "synthetic@example.invalid";
    await handler(request(p));
    const r = (await pool.query("SELECT * FROM bridge.webhook_events")).rows[0];
    expect(r.author_type).toBe("unknown");
    expect(r.normalization_status).toBe("pending_context");
  });
  it("reconciles incoming_event received before incoming_chat", async () => {
    await handler(request(event));
    await handler(request(chat));
    const r = (
      await pool.query(
        "SELECT * FROM bridge.webhook_events WHERE action='incoming_event'",
      )
    ).rows[0];
    expect(r.author_type).toBe("customer");
    expect(r.normalization_status).toBe("normalized");
  });
  it("deduplicates sequential deliveries", async () => {
    await handler(request(event));
    await handler(request(event));
    const r = (await pool.query("SELECT * FROM bridge.webhook_events")).rows;
    expect(r).toHaveLength(1);
    expect(r[0].delivery_count).toBe(2);
    expect(r[0].last_received_at.getTime()).toBeGreaterThanOrEqual(
      r[0].received_at.getTime(),
    );
  });
  it("deduplicates simultaneous independent PostgreSQL connections", async () => {
    const result = await Promise.all([
      handler(request(event)),
      handler(request(event)),
    ]);
    expect(result.map((x) => x.status)).toEqual([200, 200]);
    const r = (await pool.query("SELECT * FROM bridge.webhook_events")).rows;
    expect(r).toHaveLength(1);
    expect(r[0].delivery_count).toBe(2);
  });
  it("reconciles concurrent chat and event", async () => {
    await Promise.all([handler(request(event)), handler(request(chat))]);
    const r = (
      await pool.query(
        "SELECT * FROM bridge.webhook_events WHERE action='incoming_event'",
      )
    ).rows[0];
    expect(r.author_type).toBe("customer");
  });
  it("preserves additional fields but recursively redacts secret_key", async () => {
    await handler(
      request({
        ...event,
        additional: { test: true, secret_key: "nested-secret" },
      }),
    );
    const r = (await pool.query("SELECT * FROM bridge.webhook_events")).rows[0];
    expect(r.raw_payload.additional).toEqual({
      test: true,
      secret_key: "[REDACTED]",
    });
    expect(JSON.stringify(r.raw_payload)).not.toContain(
      "synthetic-secret-only",
    );
  });
  it("uses canonical fallback when IDs are missing", async () => {
    const p = clone(event);
    delete (p.payload.event as { id?: string }).id;
    await handler(request(p));
    await handler(request(Object.fromEntries(Object.entries(p).reverse())));
    const r = (await pool.query("SELECT * FROM bridge.webhook_events")).rows;
    expect(r).toHaveLength(1);
    expect(r[0].deduplication_key).toMatch(/^fallback:/);
    expect(r[0].delivery_count).toBe(2);
    expect(r[0].normalization_status).toBe("unsupported_shape");
  });
  it("does not turn initial embedded events into fabricated incoming_event deliveries", async () => {
    const p = clone(chat);
    (p.payload.chat.thread.events as unknown[]).push(event.payload.event);
    await handler(request(p));
    expect(
      (await pool.query("SELECT * FROM bridge.webhook_events")).rows,
    ).toHaveLength(1);
  });
  it("returns 503 without database error disclosure", async () => {
    const h = createWebhookHandler(
      () => config,
      async () => {
        throw new Error("postgres://private-secret");
      },
    );
    const r = await h(request(event));
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private-secret");
  });
  it("ACK waits for successful durable transaction", async () => {
    let commit!: () => void;
    const blocked = new Promise<void>((r) => {
      commit = r;
    });
    const h = createWebhookHandler(
      () => config,
      async (n) => {
        await blocked;
        return save(n);
      },
    );
    let done = false;
    const response = h(request(chat)).then((x) => {
      done = true;
      return x;
    });
    await new Promise((r) => setTimeout(r, 15));
    expect(done).toBe(false);
    commit();
    expect((await response).status).toBe(200);
  });
});
describe("Protected lab and rendering", () => {
  it("challenges unauthenticated list and detail", () => {
    for (const path of ["/webhook-lab", "/webhook-lab/123"])
      expect(proxy(new NextRequest("http://localhost" + path)).status).toBe(
        401,
      );
  });
  it("accepts valid Basic credentials and rejects invalid ones", () => {
    vi.stubEnv("WEBHOOK_LAB_USERNAME", "test");
    vi.stubEnv("WEBHOOK_LAB_PASSWORD", "synthetic-pass");
    for (const [pass, status] of [
      ["synthetic-pass", 200],
      ["wrong", 401],
    ] as const) {
      const h = "Basic " + Buffer.from("test:" + pass).toString("base64");
      expect(
        proxy(
          new NextRequest("http://localhost/webhook-lab", {
            headers: { authorization: h },
          }),
        ).status,
      ).toBe(status);
    }
    vi.unstubAllEnvs();
  });
  it("renders HTML as escaped text and redacts the payload view", async () => {
    const p = clone(event);
    p.payload.event.text = "<script>alert(1)</script>";
    await handler(request(p));
    const rows = (await pool.query("SELECT * FROM bridge.webhook_events")).rows;
    const html = renderToStaticMarkup(<EventList events={rows} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    const detail = renderToStaticMarkup(
      <PayloadViewer
        payload={{ secret_key: "secret-value", text: p.payload.event.text }}
      />,
    );
    expect(detail).not.toContain("secret-value");
    expect(detail).toContain("[REDACTED]");
    expect(detail).not.toContain("<script>");
  });
  it("redaction leaves source input untouched", () => {
    const p = clone(event);
    redact(p);
    expect(p.secret_key).toBe("synthetic-secret-only");
  });
});
