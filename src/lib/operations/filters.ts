import type { Filters } from "./types";
import { localDay, shiftDay, validDay } from "./time";
export function parseFilters(
  params: URLSearchParams,
  now = new Date(),
): Filters {
  const today = localDay(now),
    preset = params.get("period") ?? "7";
  const defaults = {
    from: shiftDay(today, preset === "today" ? 0 : preset === "30" ? -29 : -6),
    to: today,
  };
  const from = params.get("from") || defaults.from,
    to = params.get("to") || defaults.to;
  if (
    !validDay(from) ||
    !validDay(to) ||
    from > to ||
    (Date.parse(to) - Date.parse(from)) / 86400000 > 365
  )
    throw new Error("Selecciona un período válido de hasta 366 días.");
  const page = Number(params.get("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new Error("Página no válida.");
  const group = params.get("group") ?? "";
  if (group && !/^\d{1,10}$/.test(group)) throw new Error("Grupo no válido.");
  const response = params.get("response") ?? "";
  if (!["", "with", "without"].includes(response))
    throw new Error("Filtro de respuesta no válido.");
  const sort = params.get("sort") ?? "recent";
  if (!["recent", "oldest", "messages"].includes(sort))
    throw new Error("Orden no válido.");
  const chat = (params.get("chat") ?? "").slice(0, 200),
    agent = (params.get("agent") ?? "").slice(0, 200);
  return { from, to, chat, group, agent, response, sort, page };
}
export function filtersFromSearch(
  search: Record<string, string | string[] | undefined>,
): Filters {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(search))
    if (typeof v === "string") params.set(k, v);
  return parseFilters(params);
}
export function filterParams(f: Filters): URLSearchParams {
  return new URLSearchParams(Object.entries(f).map(([k, v]) => [k, String(v)]));
}
