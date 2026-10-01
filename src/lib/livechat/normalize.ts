import type { Envelope } from "./validation";
import { redact } from "./validation";
import { deduplicationKey } from "./idempotency";
import type {
  AuthorType,
  InternalChatEvent,
  Normalized,
} from "../events/types";
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
export function normalizeLiveChatEvent(
  p: Envelope,
  received: string,
): Normalized {
  const chat = obj(p.payload.chat),
    thread = obj(chat.thread),
    ev = obj(p.payload.event),
    isChat = p.action === "incoming_chat";
  const errors: string[] = [];
  const created = isChat ? null : str(ev.created_at);
  const validDate =
    created &&
    /^\d{4}-\d{2}-\d{2}T/.test(created) &&
    Number.isFinite(Date.parse(created))
      ? created
      : null;
  const e: InternalChatEvent = {
    version: 1,
    source: "livechat",
    organization_id: p.organization_id,
    action: p.action,
    chat_id: str(isChat ? chat.id : p.payload.chat_id),
    thread_id: str(isChat ? thread.id : p.payload.thread_id),
    event_id: isChat ? null : str(ev.id),
    event_type: isChat ? null : str(ev.type),
    author: { id: isChat ? null : str(ev.author_id), type: "unknown" },
    content: { text: !isChat && typeof ev.text === "string" ? ev.text : null },
    created_at: validDate,
    received_at: received,
  };
  if (!e.chat_id) errors.push("missing_chat_id");
  if (!e.thread_id) errors.push("missing_thread_id");
  if (!isChat) {
    if (!e.event_id) errors.push("missing_event_id");
    if (!e.event_type) errors.push("missing_event_type");
    if (!validDate) errors.push("missing_or_invalid_created_at");
    if (e.event_type === "message" && e.content.text === null)
      errors.push("message_without_text");
    if (e.event_type === "system_message") e.author.type = "system";
  }
  const users: Record<string, AuthorType> = Object.create(null);
  if (Array.isArray(chat.users))
    for (const u of chat.users) {
      const user = obj(u);
      if (str(user.id) && (user.type === "customer" || user.type === "agent"))
        users[user.id as string] = user.type;
    }
  const access = obj(thread.access);
  const groups = Array.isArray(access.group_ids)
    ? access.group_ids.filter(
        (g): g is number => typeof g === "number" && Number.isInteger(g),
      )
    : [];
  const raw = redact(p) as Record<string, unknown>;
  return {
    event: e,
    webhook_id: p.webhook_id,
    raw_payload: raw,
    deduplication_key: deduplicationKey(e, raw),
    normalization_status: errors.length
      ? "unsupported_shape"
      : !isChat && e.author.type === "unknown"
        ? "pending_context"
        : "normalized",
    normalization_errors: errors,
    context: isChat && e.chat_id && e.thread_id ? { users, groups } : null,
  };
}
