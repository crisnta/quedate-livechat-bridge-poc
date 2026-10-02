import type { PoolClient } from "pg";
import { database } from "../db/client";
import { resolveAuthor } from "../livechat/author-resolution";
import type { AuthorType, EventRow, Normalized } from "./types";
export type Query = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;
// Caller owns the transaction. A row lock serializes context and events for a thread,
// including concurrent delivery before incoming_chat. No network API enrichment.
export async function persistInTransaction(
  query: Query,
  n: Normalized,
): Promise<string> {
  const e = n.event;
  if (e.chat_id && e.thread_id) {
    const ids = [e.organization_id, e.chat_id, e.thread_id];
    await query(
      `INSERT INTO bridge.chat_context(organization_id,chat_id,thread_id,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [...ids, e.received_at],
    );
    const { rows } = await query(
      `SELECT users FROM bridge.chat_context WHERE organization_id=$1 AND chat_id=$2 AND thread_id=$3 FOR UPDATE`,
      ids,
    );
    if (n.context) {
      await query(
        `UPDATE bridge.chat_context SET users=users || $4::jsonb, group_ids=$5::jsonb,updated_at=GREATEST(updated_at,$6::timestamptz) WHERE organization_id=$1 AND chat_id=$2 AND thread_id=$3`,
        [
          ...ids,
          JSON.stringify(n.context.users),
          JSON.stringify(n.context.groups),
          e.received_at,
        ],
      );
    }
    const users = {
      ...(rows[0].users as Record<string, AuthorType>),
      ...n.context?.users,
    };
    if (e.author.type === "unknown")
      e.author.type = resolveAuthor(e.author.id, users);
    if (
      n.normalization_status === "pending_context" &&
      e.author.type !== "unknown"
    )
      n.normalization_status = "normalized";
  }
  const values = [
    e.organization_id,
    n.webhook_id,
    e.action,
    e.chat_id,
    e.thread_id,
    e.event_id,
    e.event_type,
    e.author.id,
    e.author.type,
    e.content.text,
    e.created_at,
    e.received_at,
    JSON.stringify(n.raw_payload),
    n.deduplication_key,
    n.normalization_status,
    JSON.stringify(n.normalization_errors),
  ];
  const { rows } = await query(
    `INSERT INTO bridge.webhook_events(organization_id,webhook_id,action,chat_id,thread_id,event_id,event_type,author_id,author_type,text,created_at,received_at,raw_payload,deduplication_key,normalization_status,normalization_errors,last_received_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16::jsonb,$12)
 ON CONFLICT(deduplication_key) DO UPDATE SET delivery_count=bridge.webhook_events.delivery_count+1,last_received_at=GREATEST(bridge.webhook_events.last_received_at,EXCLUDED.last_received_at),received_at=LEAST(bridge.webhook_events.received_at,EXCLUDED.received_at) RETURNING id`,
    values,
  );
  if (n.context) {
    await query(
      `UPDATE bridge.webhook_events e SET author_type=c.users->>e.author_id,normalization_status=CASE WHEN e.normalization_status='pending_context' THEN 'normalized' ELSE e.normalization_status END
   FROM bridge.chat_context c WHERE e.organization_id=c.organization_id AND e.chat_id=c.chat_id AND e.thread_id=c.thread_id
   AND c.organization_id=$1 AND c.chat_id=$2 AND c.thread_id=$3 AND e.author_type='unknown' AND c.users->>e.author_id IN ('agent','customer')`,
      [e.organization_id, e.chat_id, e.thread_id],
    );
  }
  return rows[0].id as string;
}
export async function saveEvent(n: Normalized): Promise<string> {
  const client: PoolClient = await database().connect();
  try {
    await client.query("BEGIN");
    const id = await persistInTransaction((s, p) => client.query(s, p), n);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export async function listEvents(
  chat?: string,
  before?: string,
): Promise<EventRow[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (chat) {
    params.push(chat);
    clauses.push(`chat_id=$${params.length}`);
  }
  // Cursor is a UUID of a visible row; timestamp + UUID gives stable pagination.
  if (before) {
    params.push(before);
    clauses.push(
      `(received_at,id)<(SELECT received_at,id FROM bridge.webhook_events WHERE id=$${params.length}::uuid)`,
    );
  }
  const result = await database().query(
    `SELECT id,organization_id,webhook_id,action,chat_id,thread_id,event_id,event_type,author_id,author_type,text,created_at,received_at,deduplication_key,delivery_count,last_received_at,normalization_status,normalization_errors,normalization_version FROM bridge.webhook_events ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY received_at DESC,id DESC LIMIT 50`,
    params,
  );
  return result.rows;
}
export async function getEvent(id: string): Promise<EventRow | undefined> {
  return (
    await database().query(
      "SELECT * FROM bridge.webhook_events WHERE id=$1::uuid",
      [id],
    )
  ).rows[0];
}
