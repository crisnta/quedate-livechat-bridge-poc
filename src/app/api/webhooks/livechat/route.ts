import { createWebhookHandler } from "@/lib/livechat/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createWebhookHandler();
