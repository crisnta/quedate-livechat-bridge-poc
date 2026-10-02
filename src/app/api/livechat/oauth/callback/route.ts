import { createOAuthCallback } from "@/lib/livechat/oauth/callback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createOAuthCallback();
