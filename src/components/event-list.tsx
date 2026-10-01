import type { EventRow } from "@/lib/events/types";
export const time = (v: Date | string | null) =>
  v ? new Date(v).toISOString() : "—";
export function EventList({ events }: { events: EventRow[] }) {
  return (
    <div>
      {events.length === 0 ? (
        <p>No hay eventos para este filtro.</p>
      ) : (
        events.map((e) => (
          <article key={e.id}>
            <div className="event-heading">
              <strong>
                {e.action === "incoming_chat" ? "CHAT / THREAD" : "EVENTO"} ·{" "}
                {e.action}
              </strong>
              <span>{e.normalization_status}</span>
            </div>
            <p>
              Recibido: {time(e.received_at)} · Origen: {time(e.created_at)}{" "}
              (UTC)
            </p>
            <dl>
              <dt>chat_id</dt>
              <dd>{e.chat_id ?? "—"}</dd>
              <dt>thread_id</dt>
              <dd>{e.thread_id ?? "—"}</dd>
              <dt>event_id</dt>
              <dd>{e.event_id ?? "—"}</dd>
              <dt>Autor</dt>
              <dd>{e.author_type}</dd>
              <dt>Entregas</dt>
              <dd>{e.delivery_count}</dd>
            </dl>
            <p className="message">{e.text ?? "Sin texto de mensaje"}</p>
            {e.normalization_errors.length > 0 && (
              <p className="error">
                Normalización: {e.normalization_errors.join(", ")}
              </p>
            )}
            {e.deduplication_key.startsWith("fallback:") && (
              <p>Idempotencia: hash de respaldo (faltan IDs).</p>
            )}
            <a href={"/webhook-lab/" + e.id}>Ver detalle y JSON</a>
          </article>
        ))
      )}
    </div>
  );
}
