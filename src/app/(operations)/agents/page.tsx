import { operations } from "@/lib/operations/server";
import { filtersFromSearch } from "@/lib/operations/filters";
import {
  Heading,
  FiltersBar,
  Pagination,
  DatabaseError,
  Badge,
  Empty,
  formatTime,
} from "@/components/operations/shared";
export default async function Agents({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  let f;
  try {
    f = filtersFromSearch(await searchParams);
  } catch {
    return <p role="alert">Filtros no válidos.</p>;
  }
  let data;
  try {
    data = await operations().agents(f);
  } catch {
    return <DatabaseError />;
  }
  return (
    <>
      <Heading
        title="Agentes observados"
        description="Autores agente detectados en los eventos. Identificadores que contienen correos se enmascaran."
      >
        <Badge>Presencia online no disponible</Badge>
      </Heading>
      <FiltersBar filters={f} />
      <section className="panel flush">
        {data.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Identificador</th>
                  <th>Conversaciones</th>
                  <th>Mensajes</th>
                  <th>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a, i) => (
                  <tr key={i}>
                    <td className="mono">{String(a.author_id)}</td>
                    <td>{String(a.conversations)}</td>
                    <td>{String(a.messages)}</td>
                    <td>{formatTime(a.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Sin agentes autores observados"
            description="La ausencia de mensajes de agente no demuestra ausencia de asignación."
          />
        )}
      </section>
      <Pagination path="/agents" filters={f} data={data} />
    </>
  );
}
