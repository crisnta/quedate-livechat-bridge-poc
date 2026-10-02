import { createHash } from "node:crypto";
import { authorizedLab, labChallenge } from "@/lib/security/lab-auth";
import { operations } from "@/lib/operations/server";
import { parseFilters } from "@/lib/operations/filters";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!authorizedLab(request.headers.get("authorization")))
    return labChallenge();
  const url = new URL(request.url);
  let filters;
  try {
    filters = parseFilters(url.searchParams);
  } catch {
    return Response.json({ error: "invalid_filters" }, { status: 400 });
  }
  const selected = url.searchParams.get("selected") ?? "";
  if (selected.length > 200)
    return Response.json({ error: "invalid_chat" }, { status: 400 });
  try {
    const reader = operations();
    const health = await reader.health();
    const etag =
      '"' +
      createHash("sha256")
        .update(
          JSON.stringify([
            health.revision,
            health.last_webhook,
            health.last_source_activity,
            filters,
            selected,
          ]),
        )
        .digest("hex") +
      '"';
    const headers = {
      "Cache-Control": "private, no-store",
      ETag: etag,
      "X-Checked-At": health.checked_at,
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    const conversations = await reader.conversations(filters, true);
    const detail = selected ? await reader.detail(selected) : null;
    return Response.json({ health, conversations, detail }, { headers });
  } catch {
    return Response.json(
      { error: "database_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
