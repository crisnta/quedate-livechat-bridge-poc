export const METRICS = [
  {
    name: "Conversaciones con actividad",
    source: "webhook_events",
    calculation: "COUNT(DISTINCT chat_id) en el período de recepción",
    available: true,
  },
  {
    name: "Threads recibidos",
    source: "incoming_chat",
    calculation: "COUNT de capturas deduplicadas; no equivale a chats nuevos",
    available: true,
  },
  {
    name: "Mensajes de usuarios",
    source: "incoming_event / message / customer",
    calculation: "COUNT de filas lógicas, sin multiplicar delivery_count",
    available: true,
  },
  {
    name: "Mensajes de agentes",
    source: "incoming_event / message / agent",
    calculation: "COUNT de filas lógicas",
    available: true,
  },
  {
    name: "Conversaciones con respuesta observada",
    source: "message / agent",
    calculation: "Chats distintos con mensaje de agente dentro del período",
    available: true,
  },
  {
    name: "Conversaciones sin respuesta observada",
    source: "Mensajes capturados",
    calculation:
      "Chats sin mensaje de agente en el período; no demuestra ausencia de atención",
    available: true,
  },
  {
    name: "Por hora / día",
    source: "received_at",
    calculation:
      "Agrupación SQL en America/Santiago; un chat puede aparecer en varios intervalos",
    available: true,
  },
  {
    name: "Por grupo detectado",
    source: "chat_context.group_ids",
    calculation:
      "COUNT(DISTINCT chat_id) por grupo; grupos múltiples no son aditivos",
    available: true,
  },
  {
    name: "Entregas repetidas",
    source: "delivery_count",
    calculation:
      "SUM(delivery_count - 1) de eventos recibidos inicialmente en el período",
    available: true,
  },
  {
    name: "Activos / cerrados / en espera",
    source: "Instrumentación faltante",
    calculation: "Requiere señales de cierre y routing",
    available: false,
  },
  {
    name: "Duración final",
    source: "Cierre no capturado",
    calculation: "Requiere chat_deactivated y continuidad",
    available: false,
  },
  {
    name: "Primera respuesta",
    source: "Cobertura incompleta de mensajes iniciales",
    calculation: "Pendiente de validar continuidad por thread",
    available: false,
  },
  {
    name: "Agente actual / online",
    source: "Presencia y asignación no instrumentadas",
    calculation: "No inferir desde autores o participantes",
    available: false,
  },
  {
    name: "Categoría / riesgo / protocolo",
    source: "No existe",
    calculation: "Futura etapa; sin procesamiento IA",
    available: false,
  },
];
