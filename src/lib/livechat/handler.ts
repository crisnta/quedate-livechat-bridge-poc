import type { WebhookConfig } from "../config";
import { webhookConfig } from "../config";
import { envelopeSchema, authenticate } from "./validation";
import { normalizeLiveChatEvent } from "./normalize";
import { saveEvent } from "../events/repository";
import type { Normalized } from "../events/types";
const MAX_BYTES = 1024 * 1024;
async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function createWebhookHandler(
  getConfig: () => WebhookConfig = webhookConfig,
  save: (n: Normalized) => Promise<string> = saveEvent,
) {
  return async function POST(request: Request): Promise<Response> {
    const receivedAt = new Date().toISOString();
    const response = (status: number, error: string) =>
      Response.json(
        { error },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    let config: WebhookConfig;
    try {
      config = getConfig();
    } catch {
      return response(503, "receiver_not_configured");
    }
    if (!config.enabled) return response(503, "ingestion_disabled");
    let value: unknown;
    try {
      value = JSON.parse(await readBody(request));
    } catch (error) {
      return response(
        error instanceof Error && error.message === "too_large" ? 413 : 400,
        "invalid_body",
      );
    }
    const parsed = envelopeSchema.safeParse(value);
    if (!parsed.success) return response(400, "invalid_envelope");
    if (!authenticate(parsed.data, config))
      return response(403, "unauthorized_webhook");
    try {
      const id = await save(normalizeLiveChatEvent(parsed.data, receivedAt));
      return Response.json(
        { ok: true, id },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return response(503, "persistence_failed");
    }
  };
}
