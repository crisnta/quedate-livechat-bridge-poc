import { notFound } from "next/navigation";
import { operations } from "@/lib/operations/server";
import {
  Heading,
  DatabaseError,
  formatTime,
  Badge,
} from "@/components/operations/shared";
import { PayloadViewer } from "@/components/payload-viewer";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  let e;
  try {
    e = await operations().event(id);
  } catch {
    return <DatabaseError />;
  }
  if (!e) notFound();
  return (
    <>
      <a className="back-link" href="/technical/events">
        ← Eventos técnicos
      </a>
      <Heading
        title={String(e.action)}
        description="Evidencia técnica persistida · acceso POC temporal."
      />
      <section className="panel">
        <Badge>{String(e.normalization_status)}</Badge>
        <dl className="detail-grid">
          <dt>Chat</dt>
          <dd>{String(e.chat_id ?? "—")}</dd>
          <dt>Thread</dt>
          <dd>{String(e.thread_id ?? "—")}</dd>
          <dt>Evento</dt>
          <dd>{String(e.event_id ?? "—")}</dd>
          <dt>Suscripción</dt>
          <dd>{String(e.webhook_id)}</dd>
          <dt>Recepción</dt>
          <dd>{formatTime(e.received_at)}</dd>
          <dt>Origen</dt>
          <dd>{formatTime(e.created_at)}</dd>
          <dt>Entregas</dt>
          <dd>{String(e.delivery_count)}</dd>
        </dl>
        {Array.isArray(e.normalization_errors) &&
          e.normalization_errors.length > 0 && (
            <p>Diagnósticos: {e.normalization_errors.join(", ")}</p>
          )}
        <PayloadViewer payload={e.raw_payload} />
      </section>
    </>
  );
}
