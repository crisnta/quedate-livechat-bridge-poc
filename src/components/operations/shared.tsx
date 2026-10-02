import type { Filters, Page, TechnicalEvent } from "@/lib/operations/types";
import { filterParams } from "@/lib/operations/filters";
import { formatTime, observedSpan } from "@/lib/operations/time";
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow ?? "CENTRO OPERACIONAL"}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Empty({
  title = "Sin actividad observada",
  description = "No hay registros disponibles para este período.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">○</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function DatabaseError() {
  return (
    <section className="panel error-panel" role="alert">
      <h2>No se pudo consultar PostgreSQL</h2>
      <p>
        Los datos no están disponibles. No se interpreta este error como una
        caída de LiveChat.
      </p>
      <a className="button" href="">
        Reintentar consulta
      </a>
    </section>
  );
}
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value?: number;
  note: string;
}) {
  return (
    <div className={"metric " + (value === undefined ? "unavailable" : "")}>
      <p>{label}</p>
      <strong>
        {value === undefined ? "No disponible" : value.toLocaleString("es-CL")}
      </strong>
      <small>{note}</small>
    </div>
  );
}
export function FiltersBar({
  filters,
  extended = false,
  conversationControls = true,
}: {
  filters: Filters;
  extended?: boolean;
  conversationControls?: boolean;
}) {
  return (
    <form className="filters">
      <label>
        Desde
        <input type="date" name="from" defaultValue={filters.from} />
      </label>
      <label>
        Hasta
        <input type="date" name="to" defaultValue={filters.to} />
      </label>
      {extended && (
        <>
          <label>
            Chat ID
            <input
              name="chat"
              placeholder="Buscar identificador"
              defaultValue={filters.chat}
            />
          </label>
          <label>
            Grupo ID
            <input
              name="group"
              inputMode="numeric"
              defaultValue={filters.group}
              placeholder="Todos"
            />
          </label>
          <label>
            Agente observado
            <input
              name="agent"
              defaultValue={filters.agent}
              placeholder="ID exacto"
            />
          </label>
          {conversationControls && (
            <>
              <label>
                Respuesta en el período
                <select name="response" defaultValue={filters.response}>
                  <option value="">Todas</option>
                  <option value="with">Agente respondió</option>
                  <option value="without">Sin respuesta observada</option>
                </select>
              </label>
              <label>
                Orden
                <select name="sort" defaultValue={filters.sort}>
                  <option value="recent">Actividad reciente</option>
                  <option value="oldest">Primera observación</option>
                  <option value="messages">Mensajes</option>
                </select>
              </label>
            </>
          )}
        </>
      )}
      <button className="button primary">Aplicar</button>
      <a className="button" href="?period=today">
        Hoy
      </a>
      <a className="button" href="?period=7">
        7 días
      </a>
      <a className="button" href="?period=30">
        30 días
      </a>
    </form>
  );
}
export function Pagination({
  path,
  filters,
  data,
}: {
  path: string;
  filters: Filters;
  data: Pick<Page<unknown>, "page" | "hasMore">;
}) {
  const link = (page: number) => {
    const q = filterParams({ ...filters, page });
    return path + "?" + q;
  };
  return (
    <nav className="pagination" aria-label="Paginación">
      {data.page > 1 ? (
        <a className="button" href={link(data.page - 1)}>
          ← Anteriores
        </a>
      ) : (
        <span />
      )}
      <span>Página {data.page}</span>
      {data.hasMore ? (
        <a className="button" href={link(data.page + 1)}>
          Siguientes →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
export function BarChart({
  title,
  description,
  data,
  color = "turquoise",
}: {
  title: string;
  description: string;
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Badge>OBSERVADO</Badge>
      </div>
      {data.length === 0 ? (
        <Empty />
      ) : (
        <div
          className="bars"
          role="img"
          aria-label={
            title + " · " + data.map((d) => d.label + ": " + d.value).join(", ")
          }
        >
          {data.map((d, i) => (
            <div
              className="bar-column"
              key={d.label + i}
              title={d.label + ": " + d.value}
            >
              <span className="bar-number">{d.value}</span>
              <div className="bar-track">
                <div
                  className={"bar-fill " + color}
                  style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
                />
              </div>
              <span className="bar-label">{d.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function TechnicalTable({ events }: { events: TechnicalEvent[] }) {
  return events.length === 0 ? (
    <Empty />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Recepción · Santiago</th>
            <th>Acción / identidad</th>
            <th>Chat / thread</th>
            <th>Autor</th>
            <th>Normalización</th>
            <th>Entregas</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{formatTime(e.received_at)}</td>
              <td>
                <strong>{e.action}</strong>
                <small>{e.event_id ?? "Sin event_id"}</small>
              </td>
              <td>
                <span className="mono">{e.chat_id ?? "—"}</span>
                <small>{e.thread_id ?? "—"}</small>
              </td>
              <td>{e.author_type}</td>
              <td>
                <Badge
                  tone={
                    e.normalization_status === "normalized"
                      ? "positive"
                      : "warning"
                  }
                >
                  {e.normalization_status}
                </Badge>
                {e.normalization_errors.length > 0 && (
                  <small>{e.normalization_errors.join(", ")}</small>
                )}
              </td>
              <td>{e.delivery_count}</td>
              <td>
                <a href={"/technical/events/" + e.id}>Detalle →</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export { formatTime, observedSpan };
