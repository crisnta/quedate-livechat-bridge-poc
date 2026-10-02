import { operations } from "@/lib/operations/server";
import { filtersFromSearch } from "@/lib/operations/filters";
import {
  Heading,
  FiltersBar,
  Pagination,
  DatabaseError,
  Empty,
  formatTime,
} from "@/components/operations/shared";
export default async function Groups({
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
    data = await operations().groups(f);
  } catch {
    return <DatabaseError />;
  }
  return (
    <>
      <Heading
        title="Grupos detectados"
        description="Grupos registrados en el contexto de los threads. No se inventan nombres ni asignaciones actuales."
      />
      <FiltersBar filters={f} />
      <section className="panel flush">
        {data.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Conversaciones</th>
                  <th>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => (
                  <tr key={String(g.group_id)}>
                    <td>
                      <strong>Grupo {String(g.group_id)}</strong>
                      <small>Nombre no instrumentado</small>
                    </td>
                    <td>{String(g.conversations)}</td>
                    <td>{formatTime(g.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Sin grupos detectados" />
        )}
      </section>
      <Pagination path="/groups" filters={f} data={data} />
      <p className="fine-print">
        Una conversación puede pertenecer a varios grupos. Los totales por grupo
        no son aditivos.
      </p>
    </>
  );
}
