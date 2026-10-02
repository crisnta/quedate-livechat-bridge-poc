import type { Conversation } from "@/lib/operations/types";
import { Badge, Empty, formatTime, observedSpan } from "./shared";
export function ConversationTable({ items }: { items: Conversation[] }) {
  return items.length === 0 ? (
    <Empty />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Evidencia</th>
            <th>Chat</th>
            <th>Primera observación</th>
            <th>Última actividad</th>
            <th>Grupos</th>
            <th>Agentes observados</th>
            <th>Mensajes</th>
            <th>Intervalo observado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.chat_id}>
              <td>
                <Badge tone={c.agent_messages ? "info" : "neutral"}>
                  {c.agent_messages
                    ? "Respuesta de agente"
                    : "Sin respuesta observada"}
                </Badge>
                <small>Estado no determinado</small>
              </td>
              <td>
                <a
                  className="mono"
                  href={"/conversations/" + encodeURIComponent(c.chat_id)}
                >
                  {c.chat_id}
                </a>
                <small>{c.threads} thread(s)</small>
              </td>
              <td>{formatTime(c.first_seen)}</td>
              <td>{formatTime(c.last_seen)}</td>
              <td>
                {c.group_ids.length ? c.group_ids.join(", ") : "No detectado"}
              </td>
              <td>{c.agents.length ? c.agents.join(", ") : "No observado"}</td>
              <td>{c.messages}</td>
              <td>
                {observedSpan(c.first_seen, c.last_seen)}
                <small>En el período</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
