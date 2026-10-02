export const TIMEZONE = "America/Santiago";
export function localDay(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
export function shiftDay(day: string, amount: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
export function validDay(day: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) === day
  );
}
export function formatTime(value: string | Date | null, full = true): string {
  if (!value) return "No disponible";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TIMEZONE,
    ...(full
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    hour12: false,
  }).format(d);
}
export function observedSpan(first: string, last: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.parse(last) - Date.parse(first)) / 1000),
  );
  if (seconds < 60) return seconds + " s";
  if (seconds < 3600) return Math.floor(seconds / 60) + " min";
  return (
    Math.floor(seconds / 3600) +
    " h " +
    Math.floor((seconds % 3600) / 60) +
    " min"
  );
}
