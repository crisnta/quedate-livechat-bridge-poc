"use client";
import { useEffect, useRef, useState } from "react";
import type {
  Conversation,
  ConversationDetail,
  Filters,
  Health,
  Page,
} from "@/lib/operations/types";
import { filterParams } from "@/lib/operations/filters";
import { startPolling } from "@/lib/operations/polling";
import { Badge, Empty, formatTime } from "./shared";
import { Timeline, Context } from "./timeline";
type Snapshot = {
  health: Health;
  conversations: Page<Conversation>;
  detail: ConversationDetail | null;
};
export function OperationalMonitor({ filters }: { filters: Filters }) {
  const [paused, setPaused] = useState(false),
    [hidden, setHidden] = useState(false),
    [selected, setSelected] = useState(""),
    [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(false),
    [checked, setChecked] = useState<string | null>(null),
    [refresh, setRefresh] = useState(0);
  const etag = useRef("");
  const query = filterParams(filters).toString();
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (paused) return;
    etag.current = "";
    return startPolling(
      async (signal) => {
        const url =
          "/api/operations/monitor?" +
          query +
          "&selected=" +
          encodeURIComponent(selected);
        const response = await fetch(url, {
          signal,
          cache: "no-store",
          headers: etag.current ? { "If-None-Match": etag.current } : {},
        });
        if (signal.aborted) return;
        if (response.status === 304) {
          setChecked(response.headers.get("x-checked-at"));
          setError(false);
          return;
        }
        if (!response.ok) throw new Error("Monitor unavailable");
        const snapshot = (await response.json()) as Snapshot;
        if (signal.aborted) return;
        etag.current = response.headers.get("etag") ?? "";
        setData(snapshot);
        setChecked(snapshot.health.checked_at);
        setError(false);
      },
      document,
      { onError: () => setError(true) },
    );
  }, [query, selected, paused, refresh]);
  return (
    <>
      <div className="monitor-toolbar">
        <div>
          <Badge
            tone={error ? "warning" : paused || hidden ? "neutral" : "positive"}
          >
            {error
              ? "Consulta fallida · datos anteriores"
              : paused
                ? "Actualización pausada"
                : hidden
                  ? "Pestaña oculta · actualización suspendida"
                  : "Actualización automática cada 5 segundos"}
          </Badge>
          <small>
            Última consulta exitosa a PostgreSQL: {formatTime(checked, false)}
          </small>
        </div>
        <button className="button" onClick={() => setPaused(!paused)}>
          {paused ? "Reanudar actualización" : "Pausar actualización"}
        </button>
        <button
          className="button"
          disabled={paused || hidden}
          onClick={() => setRefresh((x) => x + 1)}
        >
          Actualizar ahora
        </button>
      </div>
      <div className="monitor-evidence">
        <span>
          Último webhook recibido:{" "}
          <strong>{formatTime(data?.health.last_webhook ?? null)}</strong>
        </span>
        <span>
          Última actividad observada en LiveChat:{" "}
          <strong>
            {formatTime(data?.health.last_source_activity ?? null)}
          </strong>
        </span>
        <span>
          Conexión LiveChat: <strong>No verificada</strong>
        </span>
      </div>
      {error && (
        <p className="notice warning" role="alert">
          No se pudo actualizar. Los datos anteriores, si existen, se conservan
          como desactualizados.
        </p>
      )}
      <div className="monitor-grid">
        <section className="conversation-list">
          <div className="list-heading">
            <h2>Conversaciones</h2>
            <span>Actividad en el período</span>
          </div>
          {!data ? (
            <Empty
              title={error ? "Datos no disponibles" : "Consultando PostgreSQL…"}
            />
          ) : data.conversations.items.length === 0 ? (
            <Empty />
          ) : (
            data.conversations.items.map((c) => (
              <button
                className={
                  "conversation-preview " +
                  (selected === c.chat_id ? "selected" : "")
                }
                key={c.chat_id}
                onClick={() => {
                  setSelected(c.chat_id);
                  setData((previous) =>
                    previous ? { ...previous, detail: null } : previous,
                  );
                }}
              >
                <div>
                  <strong>
                    {c.chat_id.length > 18
                      ? c.chat_id.slice(0, 15) + "…"
                      : c.chat_id}
                  </strong>
                  <time>{formatTime(c.last_seen, false)}</time>
                </div>
                <Badge tone={c.agent_messages ? "info" : "neutral"}>
                  {c.agent_messages
                    ? "Respuesta de agente observada"
                    : "Sin respuesta de agente observada"}
                </Badge>
                <p>{c.last_text ?? "Sin mensaje textual capturado"}</p>
                <small>
                  {c.last_author ?? "Autor no disponible"} · {c.messages}{" "}
                  mensajes ·{" "}
                  {c.group_ids.length
                    ? "Grupo " + c.group_ids.join(", ")
                    : "Grupo no detectado"}
                </small>
                <small>Estado no determinado</small>
              </button>
            ))
          )}
          {data && (
            <p className="fine-print">
              Página {data.conversations.page} ·{" "}
              <a href={"/conversations?" + query}>Ver listado y páginas →</a>
            </p>
          )}
        </section>
        <section className="monitor-conversation">
          {data?.detail ? (
            <>
              <div className="monitor-chat-heading">
                <h2>{data.detail.chat_id}</h2>
                <a
                  href={
                    "/conversations/" + encodeURIComponent(data.detail.chat_id)
                  }
                >
                  Detalle completo →
                </a>
              </div>
              <Timeline detail={data.detail} />
              {data.detail.hasMore && (
                <p>Hay más eventos. Abre el detalle para paginar.</p>
              )}
            </>
          ) : (
            <Empty
              title={
                selected
                  ? "Consultando conversación…"
                  : "Selecciona una conversación"
              }
              description="Mensajes y evidencia capturada. La atención permanece en LiveChat."
            />
          )}
        </section>
        {data?.detail ? (
          <Context detail={data.detail} />
        ) : (
          <aside className="context-panel">
            <h2>Contexto</h2>
            <p>
              Selecciona un chat para revisar sus threads, grupos y
              participantes observados.
            </p>
            <div className="future-panel">
              <h3>IA · No habilitada</h3>
              <p>Categorización y resumen: próximamente.</p>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
