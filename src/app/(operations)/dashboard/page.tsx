import { operations } from "@/lib/operations/server";
import { filtersFromSearch } from "@/lib/operations/filters";
import {
  Heading,
  FiltersBar,
  Metric,
  BarChart,
  Badge,
  DatabaseError,
  formatTime,
  Empty,
} from "@/components/operations/shared";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  let f;
  try {
    f = filtersFromSearch(await searchParams);
  } catch {
    return <p role="alert">Período no válido.</p>;
  }
  let summary, health, recent;
  try {
    const reader = operations();
    summary = await reader.overview(f);
    health = await reader.health();
    recent = await reader.events({ ...f, page: 1 });
  } catch {
    return (
      <>
        <Heading
          title="Resumen"
          description="Actividad observada y calidad de recepción."
        />
        <DatabaseError />
      </>
    );
  }
  return (
    <>
      <Heading
        eyebrow="OBSERVACIÓN · SUPERVISIÓN · TRAZABILIDAD"
        title="Resumen operacional"
        description="Una mirada compartida de la operación. Las respuestas y la atención permanecen en LiveChat."
      >
        <Badge tone="positive">PostgreSQL consultado</Badge>
      </Heading>
      <FiltersBar filters={f} />
      <div className="metric-grid">
        <Metric
          label="Conversaciones con actividad"
          value={summary.conversations}
          note="Chats distintos recibidos en el período"
        />
        <Metric
          label="Threads recibidos"
          value={summary.threads}
          note="Capturas incoming_chat deduplicadas"
        />
        <Metric
          label="Mensajes de usuarios"
          value={summary.customer_messages}
          note="Mensajes capturados · customer"
        />
        <Metric
          label="Mensajes de agentes"
          value={summary.agent_messages}
          note="Mensajes capturados · agent"
        />
      </div>
      <div className="instrumentation-strip">
        <span>Activo · Cerrado · En espera · Primera respuesta</span>
        <Badge>Instrumentación pendiente</Badge>
      </div>
      <div className="chart-grid">
        <BarChart
          title="Conversaciones por día"
          description="Chats con eventos recibidos · Santiago"
          data={summary.daily.map((d) => ({
            label: d.bucket.slice(5),
            value: d.chats,
          }))}
        />
        <BarChart
          title="Actividad por hora"
          description="Chats distintos por hora local en el período"
          color="violet"
          data={summary.hourly.map((d) => ({
            label: d.bucket + "h",
            value: d.chats,
          }))}
        />
      </div>
      <div className="lower-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Actividad reciente</h2>
              <p>Recepciones persistidas; no expone texto del visitante.</p>
            </div>
            <a href="/audit">Ver auditoría →</a>
          </div>
          {recent.items.length ? (
            recent.items.slice(0, 8).map((e) => (
              <a
                className="activity-row"
                key={e.id}
                href={
                  e.chat_id
                    ? "/conversations/" + encodeURIComponent(e.chat_id)
                    : "/technical/events/" + e.id
                }
              >
                <span className={"activity-dot " + e.author_type} />
                <div>
                  <strong>
                    {e.action === "incoming_chat"
                      ? "Nuevo thread observado"
                      : e.author_type === "agent"
                        ? "Mensaje de agente observado"
                        : e.author_type === "customer"
                          ? "Evento del usuario recibido"
                          : "Evento recibido"}
                  </strong>
                  <small>
                    {e.chat_id ?? "Identidad parcial"} · {e.action}
                  </small>
                </div>
                <time>{formatTime(e.received_at, false)}</time>
              </a>
            ))
          ) : (
            <Empty />
          )}
        </section>
        <section className="panel">
          <h2>Estado de servicios</h2>
          <div className="service-row">
            <span>PostgreSQL</span>
            <Badge tone="positive">Consulta exitosa</Badge>
          </div>
          <div className="service-row">
            <span>Recepción Bridge</span>
            <Badge
              tone={
                process.env.WEBHOOK_INGESTION_ENABLED === "true"
                  ? "info"
                  : "warning"
              }
            >
              {process.env.WEBHOOK_INGESTION_ENABLED === "true"
                ? "Habilitada"
                : "Deshabilitada"}
            </Badge>
          </div>
          <div className="service-row">
            <span>LiveChat</span>
            <Badge>Conexión no verificada</Badge>
          </div>
          <dl className="service-times">
            <dt>Consulta PostgreSQL</dt>
            <dd>{formatTime(health.checked_at, false)}</dd>
            <dt>Última entrega webhook</dt>
            <dd>{formatTime(health.last_webhook)}</dd>
            <dt>Última actividad de origen</dt>
            <dd>{formatTime(health.last_source_activity)}</dd>
            <dt>Último incoming_chat</dt>
            <dd>{formatTime(health.last_chat)}</dd>
            <dt>Último incoming_event</dt>
            <dd>{formatTime(health.last_event)}</dd>
            <dt>Captura disponible desde</dt>
            <dd>{formatTime(health.coverage_start)}</dd>
          </dl>
          <p className="fine-print">
            Sin eventos recientes no demuestra una caída de LiveChat. La
            actividad de origen usa timestamps disponibles.
          </p>
        </section>
      </div>
      <BarChart
        title="Grupos detectados"
        description="Un chat puede tener varios grupos. Los conteos no son aditivos."
        data={summary.groups.map((g) => ({
          label: "Grupo " + g.group_id,
          value: g.chats,
        }))}
      />
    </>
  );
}
