export function maskIdentifier(id: string | null): string {
  if (!id) return "No identificado";
  if (id.includes("@")) return id.slice(0, 2) + "•••@•••";
  return id.length > 22 ? id.slice(0, 10) + "…" + id.slice(-6) : id;
}
// Additional presentation redaction. Ingestion behavior remains unchanged.
export function redactForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForDisplay);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /(secret|token|password|authorization|database_url|client_id)/i.test(
          key,
        )
          ? "[REDACTED]"
          : redactForDisplay(item),
      ]),
    );
  if (
    typeof value === "string" &&
    /^(postgres(?:ql)?:\/\/|Bearer\s)/i.test(value)
  )
    return "[REDACTED]";
  return value;
}
