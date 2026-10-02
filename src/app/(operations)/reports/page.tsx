import { operations } from "@/lib/operations/server";
import { filtersFromSearch } from "@/lib/operations/filters";
import { METRICS } from "@/lib/operations/metrics";
import {
  Heading,
  FiltersBar,
  Metric,
  BarChart,
  DatabaseError,
  Badge,
} from "@/components/operations/shared";
export default async function Reports({
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
    return <DatabaseError />;
  }
  return (
    <>
      <Heading
        title="Reportes"
        description="Indicadores trazables al registro recibido. Períodos y agrupaciones en America/Santiago."
      >
        <button className="button" disabled>
          Exportar · Próximamente
        </button>
      </Heading>
      <FiltersBar filters={f} />
      <div className="metric-grid">
        <Metric
          label="Conversaciones observadas"
          value={m.conversations}
          note="Actividad en el período"
        />
        <Metric
          label="Mensajes de usuarios"
          value={m.customer_messages}
          note="customer · message"
        />
        <Metric
          label="Mensajes de agentes"
          value={m.agent_messages}
          note="agent · message"
        />
        <Metric
          label="Autor desconocido"
          value={m.unknown_messages}
          note="No se infiere identidad"
        />
        <Metric
          label="Con respuesta observada"
          value={m.with_agent}
          note="Mensaje agente dentro del período"
        />
        <Metric
          label="Sin respuesta observada"
          value={m.without_agent}
          note="No demuestra ausencia de atención"
        />
        <Metric
          label="Primera respuesta"
          note="Pendiente de validar cobertura por thread"
        />
        <Metric label="Duración final" note="Requiere señal de cierre" />
      </div>
      <div className="chart-grid">
        <BarChart
          title="Conversaciones por día"
          description="Actividad recibida; no son necesariamente chats nuevos"
          data={m.daily.map((d) => ({
            label: d.bucket.slice(5),
            value: d.chats,
          }))}
        />
        <BarChart
          title="Mensajes por hora"
          description="Horas locales acumuladas del período"
          data={m.hourly.map((d) => ({
            label: d.bucket + "h",
            value: d.messages,
          }))}
        />
      </div>
      <BarChart
        title="Distribución por grupos detectados"
        description="Solo grupos disponibles; un chat puede pertenecer a varios"
        color="violet"
        data={m.groups.map((g) => ({
          label: "Grupo " + g.group_id,
          value: g.chats,
        }))}
      />
      <section className="panel">
        <h2>Métrica → fuente → cálculo → disponibilidad</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Métrica</th>
                <th>Fuente</th>
                <th>Cálculo</th>
                <th>Disponibilidad</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.name}>
                  <td>{m.name}</td>
                  <td>{m.source}</td>
                  <td>{m.calculation}</td>
                  <td>
                    <Badge tone={m.available ? "info" : "neutral"}>
                      {m.available ? "Datos observados" : "No disponible"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="fine-print">
        Mensajes iniciales incluidos en snapshots se muestran en el detalle.
        Estos indicadores cuentan solo filas incoming_event; no se afirma
        cobertura completa. Un cero representa ausencia de registros en la
        captura, no ausencia de operación en LiveChat.
      </p>
    </>
  );
}
