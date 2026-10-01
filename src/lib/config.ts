export type WebhookConfig = {
  secret: string;
  organization: string;
  chatWebhook: string;
  eventWebhook: string;
  enabled: boolean;
};
export function webhookConfig(): WebhookConfig {
  const names = [
    "LIVECHAT_WEBHOOK_SECRET",
    "LIVECHAT_ORGANIZATION_ID",
    "LIVECHAT_INCOMING_CHAT_WEBHOOK_ID",
    "LIVECHAT_INCOMING_EVENT_WEBHOOK_ID",
  ] as const;
  if (names.some((n) => !process.env[n]))
    throw new Error("Webhook configuration incomplete");
  if (process.env[names[2]] === process.env[names[3]])
    throw new Error("Webhook IDs must differ");
  return {
    secret: process.env[names[0]]!,
    organization: process.env[names[1]]!,
    chatWebhook: process.env[names[2]]!,
    eventWebhook: process.env[names[3]]!,
    enabled: process.env.WEBHOOK_INGESTION_ENABLED === "true",
  };
}
