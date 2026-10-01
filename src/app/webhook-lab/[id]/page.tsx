import { notFound } from "next/navigation";
import { requireLab } from "@/lib/security/require-lab";
import { getEvent } from "@/lib/events/repository";
import { EventList, time } from "@/components/event-list";
import { PayloadViewer } from "@/components/payload-viewer";
export const dynamic = "force-dynamic";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireLab();
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  let event;
  try {
    event = await getEvent(id);
  } catch {
    return <p role="alert">No se pudo consultar la base de datos.</p>;
  }
  if (!event) notFound();
  return (
    <>
      <a href="/webhook-lab">← Últimos eventos</a>
      <h1>Detalle técnico</h1>
      <EventList events={[event]} />
      <p>Última recepción: {time(event.last_received_at)}</p>
      <p>
        Versión normalizador: {event.normalization_version} · Suscripción:{" "}
        {event.webhook_id}
      </p>
      <PayloadViewer payload={event.raw_payload} />
    </>
  );
}
