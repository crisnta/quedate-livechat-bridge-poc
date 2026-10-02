import { filtersFromSearch } from "@/lib/operations/filters";
import { Heading, FiltersBar } from "@/components/operations/shared";
import { OperationalMonitor } from "@/components/operations/monitor";
export default async function Monitor({
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
  return (
    <>
      <Heading
        title="Monitor operacional"
        description="Actividad observada, respuesta de agentes y contexto. Actualización automática cada 5 segundos."
      />
      <FiltersBar filters={f} extended />
      <div className="disabled-filters">
        <span>Estados no determinados:</span>
        {[
          "Activo",
          "Cerrado",
          "En espera",
          "Asignado actualmente",
          "Agente online",
        ].map((s) => (
          <button disabled key={s}>
            {s}
          </button>
        ))}
      </div>
      <OperationalMonitor filters={f} />
    </>
  );
}
