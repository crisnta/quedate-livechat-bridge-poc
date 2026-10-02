import { notFound } from "next/navigation";
import { operations } from "@/lib/operations/server";
import { Heading, Badge, DatabaseError } from "@/components/operations/shared";
import { Timeline, Context } from "@/components/operations/timeline";
export default async function Conversation({
  params,
  searchParams,
}: {
  params: Promise<{ chatId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { chatId } = await params;
  const s = await searchParams;
  const page = Number(s.page ?? 1);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    chatId.length > 200
  )
    notFound();
  let detail;
  let visitors: { alias: string | null; email: string | null }[] = [];
  try {
    const reader = operations();
    detail = await reader.detail(chatId, page, s.thread);
    if (s.visitor === "1") visitors = await reader.visitor(chatId);
  } catch {
    return <DatabaseError />;
  }
  if (!detail) notFound();
  const link = (p: number) =>
    "?" +
    new URLSearchParams({
      page: String(p),
      ...(s.thread ? { thread: s.thread } : {}),
    });
  return (
    <>
      <a className="back-link" href="/conversations">
        ← Conversaciones
      </a>
      <Heading
        title={"Conversación " + chatId}
        description="Timeline de evidencia capturada. No certifica historial completo anterior al Bridge."
      >
        <Badge>Solo observación</Badge>
      </Heading>
      <form className="filters">
        <label>
          Thread
          <select name="thread" defaultValue={s.thread ?? ""}>
            <option value="">Todos los threads</option>
            {detail.threads.map((t) => (
              <option key={t.thread_id}>{t.thread_id}</option>
            ))}
          </select>
        </label>
        <button className="button">Ver thread</button>
      </form>
      <div className="conversation-layout">
        <section className="panel conversation-main">
          <div className="section-heading">
            <h2>Timeline</h2>
            <Badge>Estado no determinado</Badge>
          </div>
          <p className="fine-print">
            Páginas por recepción; mensajes ordenados por fecha de origen dentro
            de cada página. Incluye capturas iniciales identificadas, sin
            duplicarlas.
          </p>
          <Timeline detail={detail} />
          <nav className="pagination">
            {page > 1 ? (
              <a href={link(page - 1)}>← Página anterior</a>
            ) : (
              <span />
            )}
            <span>Página {page} · hasta 100 eventos</span>
            {detail.hasMore ? (
              <a href={link(page + 1)}>Eventos anteriores →</a>
            ) : (
              <span />
            )}
          </nav>
          <div className="visitor-section">
            <h3>Datos del visitante</h3>
            {s.visitor === "1" ? (
              <>
                <p>
                  Acceso técnico temporal. Los datos no se incluyen en listas ni
                  indicadores.
                </p>
                {visitors?.length ? (
                  visitors.map((v, i) => (
                    <dl key={i}>
                      <dt>Alias registrado</dt>
                      <dd>{v.alias ?? "No disponible"}</dd>
                      <dt>Correo registrado</dt>
                      <dd>{v.email ?? "No disponible"}</dd>
                    </dl>
                  ))
                ) : (
                  <p>No disponibles en la captura consultada.</p>
                )}
                <a href={link(page)}>Ocultar datos</a>
              </>
            ) : (
              <>
                <p>
                  Ocultos inicialmente. No se consulta IP ni información de
                  dispositivo.
                </p>
                <a className="button" href={link(page) + "&visitor=1"}>
                  Mostrar alias / correo registrados
                </a>
              </>
            )}
          </div>
        </section>
        <Context detail={detail} />
      </div>
    </>
  );
}
