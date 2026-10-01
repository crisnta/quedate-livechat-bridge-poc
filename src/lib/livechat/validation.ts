import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { WebhookConfig } from "../config";
export const envelopeSchema = z
  .object({
    secret_key: z.string(),
    organization_id: z.string().min(1),
    webhook_id: z.string().min(1),
    action: z.enum(["incoming_chat", "incoming_event"]),
    payload: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type Envelope = z.infer<typeof envelopeSchema>;
export function secretEqual(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function authenticate(p: Envelope, c: WebhookConfig): boolean {
  return (
    secretEqual(p.secret_key, c.secret) &&
    p.organization_id === c.organization &&
    p.webhook_id ===
      (p.action === "incoming_chat" ? c.chatWebhook : c.eventWebhook)
  );
}
// Recursive: a nested key must not leak into detail pages or fixtures either.
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k.toLowerCase() === "secret_key" ? "[REDACTED]" : redact(v),
      ]),
    );
  return value;
}
