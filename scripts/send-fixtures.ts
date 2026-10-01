import nextEnv from "@next/env";
import { readFile } from "node:fs/promises";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const target = process.argv[2] ?? "http://localhost:3000";
const url = new URL("/api/webhooks/livechat", target);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
  url.protocol !== "https:"
)
  throw new Error("Use HTTPS for remote tests");
for (const name of ["incoming-chat", "incoming-event"]) {
  const fixture = JSON.parse(
    await readFile(`tests/fixtures/${name}.json`, "utf8"),
  );
  fixture.secret_key = process.env.LIVECHAT_WEBHOOK_SECRET;
  fixture.organization_id = process.env.LIVECHAT_ORGANIZATION_ID;
  fixture.webhook_id =
    process.env[
      name === "incoming-chat"
        ? "LIVECHAT_INCOMING_CHAT_WEBHOOK_ID"
        : "LIVECHAT_INCOMING_EVENT_WEBHOOK_ID"
    ];
  if (!fixture.secret_key || !fixture.organization_id || !fixture.webhook_id)
    throw new Error("Configure local environment first");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fixture),
  });
  console.log(`${name}: HTTP ${response.status}`);
  if (!response.ok) process.exitCode = 1;
}
