import { createHash } from "node:crypto";
import type { InternalChatEvent } from "../events/types";
function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => JSON.stringify(k) + ":" + canonical(x))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export function deduplicationKey(e: InternalChatEvent, raw: unknown) {
  const ids = [
    e.organization_id,
    e.action,
    e.chat_id,
    e.thread_id,
    ...(e.action === "incoming_event" ? [e.event_id] : []),
  ];
  return ids.every(Boolean)
    ? "ids:" + JSON.stringify(ids)
    : "fallback:" + createHash("sha256").update(canonical(raw)).digest("hex");
}
