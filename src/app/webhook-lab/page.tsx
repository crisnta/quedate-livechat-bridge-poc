import { requireLab } from "@/lib/security/require-lab";
import { listEvents } from "@/lib/events/repository";
import { EventList } from "@/components/event-list";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function Lab({
  searchParams,
}: {
  searchParams: Promise<{ chat_id?: string; before?: string }>;
}) {
  await requireLab();
  const search = await searchParams;
  const chat = typeof search.chat_id === "string" ? search.chat_id : undefined;
  const before =
    typeof search.before === "string" && uuid.test(search.before)
      ? search.before
      : undefined;
  let events;
  try {
    events = await listEvents(chat, before);
  } catch {
    return (
      <>
        <h1>Quédate LiveChat Bridge</h1>
        <p role="alert">
          Base de datos no disponible o migración pendiente. Revisa la
          configuración del servidor.
        </p>
      </>
    );
  }
  const query = new URLSearchParams(chat ? { chat_id: chat } : {});
  return (
    <>
      <h1>Quédate LiveChat Bridge</h1>
      <p className="notice">
        POC receptor · Solo datos ficticios. Activación real BLOQUEADA:
        aislamiento de tráfico pendiente de verificar.
      </p>
      <form>
        <label>
          Filtrar por chat_id <input name="chat_id" defaultValue={chat} />
        </label>
        <button>Filtrar</button> <a href="/webhook-lab">Limpiar</a>
      </form>
      <p>
        <a href={"/webhook-lab?" + query}>Refrescar últimos eventos</a> · Hasta
        50 por página · Horas UTC
      </p>
      <EventList events={events} />
      {events.length === 50 && (
        <a
          href={
            "/webhook-lab?" +
            new URLSearchParams({
              ...Object.fromEntries(query),
              before: events[49].id,
            })
          }
        >
          Ver anteriores
        </a>
      )}
    </>
  );
}
