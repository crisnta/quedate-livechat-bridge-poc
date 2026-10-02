import { operations } from "@/lib/operations/server";
import { filtersFromSearch } from "@/lib/operations/filters";
import {
  Heading,
  FiltersBar,
  DatabaseError,
  Badge,
  Empty,
} from "@/components/operations/shared";
export default async function Alerts({
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
  let m;
  try {
    m = await operations().overview(f);
  } catch {
    return (
      <>
        <Heading
          title="Alertas técnicas"
          description="Hallazgos verificables, sin inferir riesgo clínico."
        />
        <DatabaseError />
      </>
    );
  }
  const alerts = [
    {
      label: "Eventos con forma no soportada",
      count: m.unsupported,
      note: "Revisar los diagnósticos de normalización.",
      tone: "warning",
    },
    {
      label: "Autores pendientes de contexto",
      count: m.pending,
      note: "No se pudo determinar el autor con el contexto disponible.",
      tone: "warning",
    },
    {
      label: "Entregas repetidas reconocidas",
      count: m.repeated_deliveries,
      note: "La idempotencia evitó nuevas filas; no implica fallo.",
      tone: "info",
    },
  ].filter((a) => a.count > 0);
  return (
    <>
      <Heading
        title="Alertas técnicas"
        description="Calidad de datos capturados. No se interpreta silencio de eventos como desconexión."
      />
      <FiltersBar filters={f} />
      {alerts.length ? (
        alerts.map((a) => (
          <section className="panel alert-card" key={a.label}>
            <Badge tone={a.tone}>{a.count}</Badge>
            <div>
              <h2>{a.label}</h2>
              <p>{a.note}</p>
            </div>
            <a href="/technical/events">Revisar eventos →</a>
          </section>
        ))
      ) : (
        <section className="panel">
          <Empty
            title="Sin hallazgos en los registros consultados"
            description="Esto no certifica ausencia de errores fuera de la captura."
          />
        </section>
      )}
      <section className="panel">
        <h2>Instrumentación pendiente</h2>
        <p>
          Fallos históricos de recepción, errores de escritura, espera excesiva
          y conversaciones críticas no están instrumentados. No se generan
          alertas a partir de suposiciones.
        </p>
      </section>
    </>
  );
}
