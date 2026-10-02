import type { ConversationDetail } from "@/lib/operations/types";
import { Badge, Empty, formatTime, observedSpan } from "./shared";
export function Timeline({ detail }: { detail: ConversationDetail }) {
  return (
    <div className="timeline">
      {detail.timeline.length === 0 ? (
        <Empty />
      ) : (
        detail.timeline.map((e) =>
          e.type === "incoming_chat" ? (
            <div className="system-entry" key={e.key}>
              <span>Nuevo thread observado</span>
              <small>
                {e.thread_id} · {formatTime(e.received_at)}
              </small>
            </div>
          ) : (
            <div
              key={e.key}
              className={
                "message-entry " +
                (e.author_type === "agent"
                  ? "agent"
                  : e.author_type === "system"
                    ? "system"
                    : "customer")
              }
            >
              <div className="message-meta">
                <strong>
                  {e.author_type === "customer"
                    ? "Usuario"
                    : e.author_type === "agent"
                      ? "Agente"
                      : e.author_type === "system"
                        ? "Sistema"
                        : "Autor desconocido"}
                </strong>
                <time>{formatTime(e.created_at ?? e.received_at)}</time>
              </div>
              <div className="message-bubble">
                {e.text ??
                  "Evento " + e.type + " · sin contenido textual normalizado"}
              </div>
              <small>
                {e.type} · {e.thread_id ?? "Thread desconocido"}
                {e.source === "initial_snapshot"
                  ? " · Incluido en captura inicial"
                  : ""}
                {!e.created_at ? " · Hora de recepción" : ""}
              </small>
            </div>
          ),
        )
      )}
    </div>
  );
}
export function Context({ detail }: { detail: ConversationDetail }) {
  const groups = [...new Set(detail.threads.flatMap((t) => t.group_ids))];
  return (
    <aside className="context-panel">
      <h2>Contexto observado</h2>
      <Badge>Estado no determinado</Badge>
      <dl>
        <dt>Chat</dt>
        <dd className="mono">{detail.chat_id}</dd>
        <dt>Primera recepción</dt>
        <dd>{formatTime(detail.first_seen)}</dd>
        <dt>Última actividad</dt>
        <dd>{formatTime(detail.last_seen)}</dd>
        <dt>Intervalo observado</dt>
        <dd>{observedSpan(detail.first_seen, detail.last_seen)}</dd>
        <dt>Grupos detectados</dt>
        <dd>{groups.join(", ") || "No detectado"}</dd>
        <dt>Threads</dt>
        <dd>{detail.threads.length}</dd>
        <dt>Agente actual</dt>
        <dd>No disponible</dd>
        <dt>Origen / dispositivo</dt>
        <dd>No instrumentado en lectura</dd>
      </dl>
      <h3>Participantes agente</h3>
      {detail.threads.flatMap((t) =>
        Object.entries(t.users)
          .filter(([, type]) => type === "agent")
          .map(([id]) => (
            <p className="mono" key={t.thread_id + id}>
              {id}
            </p>
          )),
      )}
      <small>
        Participación registrada; no demuestra asignación actual ni presencia
        online.
      </small>
      <section className="future-panel">
        <h3>IA · No habilitada</h3>
        <p>Resumen, categoría y señales: próximamente.</p>
        <a href="/ai">Ver evolución →</a>
      </section>
    </aside>
  );
}
