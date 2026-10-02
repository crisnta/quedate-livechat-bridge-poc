import { operations } from "@/lib/operations/server";
import { filtersFromSearch } from "@/lib/operations/filters";
import {
  Heading,
  FiltersBar,
  Pagination,
  DatabaseError,
} from "@/components/operations/shared";
import { ConversationTable } from "@/components/operations/conversations";
export default async function Conversations({
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
    data = await operations().conversations(f);
  } catch {
    return <DatabaseError />;
  }
  return (
    <>
      <Heading
        title="Conversaciones"
        description="Actividad persistida, agrupada por chat. Estado operacional no determinado."
      >
        <button className="button" disabled title="Próximamente">
          Exportar · Próximamente
        </button>
      </Heading>
      <FiltersBar filters={f} extended />
      <div className="disabled-filters">
        <span>Estados aún no disponibles:</span>
        {["Activo", "Cerrado", "En espera", "Asignado actualmente"].map((s) => (
          <button disabled key={s}>
            {s}
          </button>
        ))}
      </div>
      <section className="panel flush">
        <ConversationTable items={data.items} />
      </section>
      <Pagination path="/conversations" filters={f} data={data} />
    </>
  );
}
