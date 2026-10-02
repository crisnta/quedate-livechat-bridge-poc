import { operations } from "@/lib/operations/server";
import { filtersFromSearch } from "@/lib/operations/filters";
import {
  Heading,
  FiltersBar,
  TechnicalTable,
  Pagination,
  DatabaseError,
  Badge,
} from "@/components/operations/shared";
export default async function Audit({
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
        title="Auditoría de eventos"
        description="Recepciones registradas, identidad y normalización. No es auditoría de accesos humanos."
      >
        <Badge>Evidencia persistida</Badge>
      </Heading>
      <FiltersBar filters={f} extended conversationControls={false} />
      <section className="panel flush">
        <TechnicalTable events={data.items} />
      </section>
      <Pagination path="/audit" filters={f} data={data} />
      <p className="fine-print">
        Una fila lógica puede representar varias entregas. No existe historial
        separado de cada reintento, acceso de operador o solicitud rechazada.
      </p>
    </>
  );
}
