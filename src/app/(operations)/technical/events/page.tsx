import { operations } from "@/lib/operations/server";
import { filtersFromSearch } from "@/lib/operations/filters";
import {
  Heading,
  FiltersBar,
  TechnicalTable,
  Pagination,
  DatabaseError,
} from "@/components/operations/shared";
export default async function Events({
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
    data = await operations().events(f);
  } catch {
    return <DatabaseError />;
  }
  return (
    <>
      <Heading
        title="Eventos técnicos"
        description="Hasta 50 eventos por página. Los payloads completos se cargan únicamente al abrir un detalle."
      />
      <FiltersBar filters={f} extended conversationControls={false} />
      <section className="panel flush">
        <TechnicalTable events={data.items} />
      </section>
      <Pagination path="/technical/events" filters={f} data={data} />
      <p>
        <a href="/webhook-lab">Abrir laboratorio original →</a>
      </p>
    </>
  );
}
