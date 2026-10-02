# Quédate LiveChat Bridge POC

Este documento conserva decisiones y restricciones del desarrollo inicial. El responsable informó posteriormente recepción real y despliegue; la sección 25 documenta la evolución actual. Las instrucciones pendientes del POC inicial no implican que esta tarea haya accedido a las cuentas ni comprobado su configuración. El aislamiento sigue requiriendo evidencia antes de ampliar tráfico.

## 1. Objetivo

Validar recepción, autenticidad, identificación de chat/thread/evento, autor, texto, fechas, persistencia y visualización. El desarrollo del agente IA pertenece a otro proyecto/equipo.

## 2. Alcance

Widget oficial → LiveChat → webhook → validación → adaptador → evento interno → Supabase PostgreSQL → `/webhook-lab`. Esta fase puede probarse con fixtures sintéticos. No requiere recepción real para verificar el código, pero la aceptación contra Supabase requiere ejecutar la prueba en una base proporcionada por el responsable.

## 3. Fuera de alcance

LLM, Gemini, OpenAI, agente IA, RAG, embeddings, pgvector, clasificación de riesgo, protocolos clínicos, `send_event`, respuestas, transferencias, asignaciones y modificación de conversaciones. No se modifica Salud 360 ni se registra ningún webhook real.

## 4. Arquitectura

```text
salud-360.cl/livechat-poc (futuro; otro repositorio)
  → widget oficial → LiveChat
  → POST /api/webhooks/livechat
  → validar sobre/secreto/organización/suscripción
  → normalizeLiveChatEvent() → InternalChatEvent v1
  → transacción PostgreSQL → COMMIT → HTTP 200

/webhook-lab (Basic) → PostgreSQL → lista/detalle/JSON redactado
```

No hay llamadas a APIs externas durante el ACK. La única dependencia remota será PostgreSQL. No hay procesamiento durable después del ACK, colas, tareas abandonadas ni memoria utilizada como almacenamiento de eventos.

## 5. Componentes y configuración técnica

Next.js 16 App Router, TypeScript, React, `pg`, Zod. Runtime Node.js. `src/proxy.ts` corresponde a la convención de Next.js 16; controla Basic para la lista y todos los detalles. Las páginas vuelven a comprobar autenticación antes de consultar datos.

Se añadieron `handler.ts` para probar el receptor sin levantar Next, `require-lab.ts` como segunda comprobación de acceso, `normalization_errors` para diagnóstico, scripts de migración/fixtures y un interruptor de recepción. Son ajustes a la estructura aprobada.

## 6. Configuración de LiveChat — registro inicial

El registro inicial de este documento describía la preparación sin acceso a la cuenta ni alta de suscripciones. Posteriormente el responsable informó que OAuth, recepción real y persistencia ya están funcionando. En la entrega del Centro Operacional no se accede a la cuenta ni se modifican suscripciones. La documentación oficial consultada muestra `secret_key` en el JSON, `organization_id`, `webhook_id`, `action` y `payload`. No se implementan firmas HMAC inventadas.

La versión de API y su disponibilidad deben comprobarse y registrarse al configurar la app. Las referencias consultadas exponen v3.6 estable; los fixtures no constituyen evidencia del formato de esta cuenta.

## 7. Grupo de pruebas y aislamiento — BLOQUEANTE

Grupo conceptual: **POC - Integración IA**, con un único agente de prueba sin participación en tráfico operativo. Un grupo por sí solo no limita las suscripciones de licencia.

No se ha confirmado un filtro `group_id` documentado para estas acciones. Debe evaluarse el filtro oficial por presencia `chat_presence.user_ids`, comprobando que el agente está presente a tiempo para recibir `incoming_chat` y los primeros mensajes. `only_my_chats` filtra origen de aplicación, no grupo.

**No activar contra operación real hasta disponer de evidencia del aislamiento en origen y de recepción completa.** Si la cuenta compartida no permite ambas cosas, usar una licencia/entorno dedicado. No probar activando todos los chats productivos y descartándolos después.

`LIVECHAT_TEST_GROUP_ID` documenta el grupo esperado para la operación manual; no es una barrera de seguridad implementada. `chat_context.group_ids` registra lo detectado en el thread. `incoming_event` puede no traer grupos. El Bridge no afirma aislamiento por conocer un chat ni por un ID de grupo configurado.

Criterios pendientes: demostrar alcance de la suscripción, ruta del widget, pertenencia del agente, ausencia de fallback operativo, comportamiento antes de asignación y ausencia de recepciones ajenas. Hacer la validación en entorno seguro sin conversaciones reales. Anotar evidencia, responsable y fecha antes de declarar resuelto este bloqueo.

## 8. Private App — pasos manuales

1. Crear la app privada del POC para LiveChat en Developer Console.
2. Revisar los permisos mínimos y el bloque de autorización.
3. Confirmar el flujo de instalación privada; si exige callback/intercambio OAuth, planificar esa configuración antes de instalar. El callback mínimo está implementado en `/api/livechat/oauth/callback`; configuración y límites en [LIVECHAT_OAUTH.md](LIVECHAT_OAUTH.md).
4. Configurar Chat Webhooks de tipo `license`, solo después de validar aislamiento.
5. Instalar de forma privada en la licencia aprobada y verificar estado habilitado.

Si se opta por Configuration API, el registro/listado documenta `webhooks.configuration:rw`; no es un permiso de envío de mensajes ni una variable requerida para cada recepción. No añadir permisos de escritura de conversaciones.

## 9. Webhooks configurados

Según la actualización informada por el responsable, se reciben realmente `incoming_chat` e `incoming_event`. La entrega inicial dejó preparados: `incoming_chat` e `incoming_event`. URL futura: `https://<dominio-poc>/api/webhooks/livechat`. Elegir el mismo secreto personalizado para ambas suscripciones; de no ser posible, adaptar configuración antes del alta.

Obtener `organization_id` de la configuración de la organización mediante un mecanismo oficial confirmado en la cuenta; no confundirlo con el license ID ni inferirlo. Obtener IDs de suscripción de consola o listado oficial. No confiar en valores de una solicitud no autenticada para configurar allowlists.

No se incluyen `chat_deactivated`, `chat_transferred` ni webhooks de usuarios. No filtrar solo autores customer: necesitamos observar también la respuesta manual del agente.

## 10. Endpoint receptor y ACK

`POST /api/webhooks/livechat`: captura `received_at` al entrar; limita cuerpo a 1 MiB, parsea JSON, valida sobre, compara secreto mediante hashes de tamaño fijo en tiempo constante y comprueba organización y correspondencia suscripción/acción.

200 únicamente tras COMMIT (incluye duplicados). JSON/sobre inválido: 400; credenciales/IDs no autorizados: 403; tamaño excesivo: 413; recepción deshabilitada, configuración incompleta o error de persistencia: 503. Otros métodos reciben el comportamiento de rechazo de Next. No se devuelven errores de base ni valores recibidos.

Payload autorizado con forma interna inesperada: se conserva redactado con `unsupported_shape` y códigos estáticos de diagnóstico. Si no puede representarse/persistirse, no recibe 200.

La guía de LiveChat describe ~10 segundos de timeout y hasta tres reintentos en ~1 minuto. Nuestro pool tiene timeout de conexión de 3 segundos y de sentencia de 4 segundos; estas cifras no garantizan por sí solas una latencia total. Debe medirse latencia del despliegue antes del uso real.

## 11. Modelo de datos

Esquema privado `bridge`:

- `webhook_events`: UUID interno, organización, suscripción, acción, chat/thread/evento/tipo, autor/tipo, texto, fechas de origen/primera y última recepción, JSONB redactado, clave única, contador, estado/errores/versión de normalización.
- `chat_context`: clave organización/chat/thread, grupos detectados, mapa técnico de ID a tipo de usuario y fecha. Se permite un contexto vacío provisional cuando llega primero un evento.

Campos ausentes quedan nulos. IDs opacos; no se extraen correos ni se almacenan perfiles adicionales. El payload original redactado puede contener metadatos adicionales enviados por LiveChat: usar solo cuentas y sesiones de prueba.

Índices para últimas recepciones y consulta de chat. Fechas `timestamptz`; interfaz en UTC. PostgreSQL conserva la precisión de origen recibida, aunque la representación JavaScript de fechas en pantalla tiene precisión de milisegundos. El JSON conserva la cadena original.

## 12. Normalización y frontera interna

`normalizeLiveChatEvent()` devuelve un objeto con `event: InternalChatEvent`, `version: 1`, `source: livechat`, acción, organización, IDs, autor, contenido textual y tiempos. El sobre de persistencia contiene payload/evidencia y diagnósticos, separados del contrato del futuro consumidor.

`incoming_chat` identifica chat y nuevo thread; no necesariamente un chat jamás visto. Extrae mapa `users[].id/type` y grupos de `thread.access.group_ids`. Sus campos de mensaje quedan nulos. Eventos iniciales del thread se ven en el JSON y no se convierten en notificaciones que nunca recibimos.

`incoming_event` extrae `payload.chat_id`, `thread_id`, `event`. Mensaje sin `text`: texto nulo y diagnóstico. Tipos sin texto pueden existir. No se interpreta HTML ni se descargan adjuntos. Los mensajes de sistema se reconocen por tipo documentado `system_message`; no se deduce el tipo por apariencia de `author_id`.

Autor desconocido: `unknown/pending_context`. La transacción consulta el contexto persistido. Cuando llega `incoming_chat`, reconcilia autores de eventos previos del mismo thread. No hace llamadas Chat API. Un autor ausente del contexto seguirá desconocido: no se implementaron webhooks de cambios de participantes.

## 13. Idempotencia y concurrencia

Clave `ids:` con array JSON de organización + acción + chat + thread y, para `incoming_event`, event ID. Evita colisiones por delimitadores. La suscripción no se usa como ID de entrega. Clave `UNIQUE` y `ON CONFLICT` incrementan contador y actualizan última recepción, sin segunda fila lógica.

Si faltan IDs: `fallback:` + SHA-256 del JSON canónico redactado. El prefijo se muestra en el laboratorio. Este respaldo detecta repeticiones equivalentes; no garantiza identidad semántica cuando cambia otro campo.

Cada transacción crea si falta y bloquea el contexto del thread (`FOR UPDATE`) antes de resolver autores y guardar. Esto evita la carrera evento/contexto. El índice único protege también variantes sin contexto. ACK perdido después de COMMIT: el reintento cuenta otra entrega sin duplicar el evento.

Orden de llegada no equivale a orden de origen ni secuencia garantizada de LiveChat. Se conserva primera recepción, contador y última recepción; no hay historial separado de todos los cuerpos de reintentos.

## 14. Variables

- `DATABASE_URL`: conexión PostgreSQL del pooler de Supabase; solo servidor.
- `LIVECHAT_WEBHOOK_SECRET`: secreto compartido de recepción.
- `LIVECHAT_ORGANIZATION_ID`: allowlist de organización.
- `LIVECHAT_INCOMING_CHAT_WEBHOOK_ID` y `LIVECHAT_INCOMING_EVENT_WEBHOOK_ID`: IDs distintos con acción fija.
- `LIVECHAT_TEST_GROUP_ID`: referencia operativa pendiente de comprobar, no filtro efectivo.
- `WEBHOOK_LAB_USERNAME` y `WEBHOOK_LAB_PASSWORD`: HTTP Basic.
- `WEBHOOK_INGESTION_ENABLED`: `false` por defecto; `true` solo para fixtures hasta resolver aislamiento.

No se necesita Supabase service-role key, Auth, Realtime, Storage ni `NEXT_PUBLIC_*`. License ID pertenece al futuro widget de Salud 360.

## 15. Seguridad

Solo mensajes ficticios: sin RUT, nombres reales, teléfonos, correos personales, datos clínicos ni conversaciones suicidas reales. Basic siempre sobre HTTPS fuera de localhost. Se verifica acceso en Proxy y antes de las consultas de las páginas. Sin caché de datos del laboratorio ni indexación.

`raw_payload` es una **copia redactada**, nunca original byte por byte. Se reemplaza recursivamente todo campo `secret_key` antes de persistir, y se vuelve a aplicar redacción al mostrar el JSON. No se registran cuerpos ni credenciales en consola. Los errores públicos son códigos estáticos. React escapa texto; no hay `dangerouslySetInnerHTML`.

Esquema privado sin grants a PUBLIC y tablas con RLS. El propietario PostgreSQL usado por el backend puede operar; no hay acceso anónimo/browser. No habilitar `bridge` en Data API. El proyecto Supabase debe ser exclusivo del POC. Definir borrado/retención al cerrar las pruebas; no hay job automático ni botón destructivo.

## 16. Despliegue

Seguir README: migración explícita, pooler de transacciones con TLS, variables privadas, build Next.js y URL estable. No hay migraciones durante build ni secretos incrustados. Separar entornos. La protección global de Vercel no debe impedir los POST sintéticos autorizados; Basic también protege la nueva consola y su API de lectura.

## 17. Casos de prueba

Fixtures en `tests/fixtures` son construidos por nosotros. Automatizados: secreto, organización e ID incorrectos; JSON inválido; acción fuera de alcance; límite de cuerpo; receptor deshabilitado; chat/evento válidos; mensaje sin texto; autor desconocido; evento antes que chat; duplicado secuencial/concurrente; chat/evento concurrentes; campos adicionales; redacción anidada; fallback canónico; eventos iniciales; error de base; ACK posterior a persistencia; Basic lista/detalle; HTML escapado.

Prueba manual contra Supabase: aplicar migración, configurar IDs sintéticos, habilitar recepción, ejecutar `fixtures:send`, ver dos filas en lab, repetir para conteo 2, refrescar y redeploy, revisar detalle sin secreto. Guardar fecha, responsable, despliegue y resultados sin credenciales.

TEST 01 abrir widget; TEST 02 iniciar chat; TEST 03 PRUEBA WEBHOOK 001; TEST 04 segundo mensaje; TEST 05 agente manual; TEST 06 ráfaga; TEST 07 persistencia; TEST 08 JSON. Todos los tests de widget/LiveChat quedan pendientes de aislamiento y configuración real. Duplicados/reintentos reales/cierre/transferencias se evaluarán después.

## 18. Resultados

Ver `docs/TEST_RESULTS.md` para resultados ejecutados. La prueba automatizada usa PostgreSQL local real, no Supabase alojado ni mocks de SQL. No afirmar validación del pooler, credenciales, TLS o Vercel sin ejecutarla en esos servicios.

## 19. Payloads observados

El responsable informó que ya existen payloads reales observados en PostgreSQL. No se consultaron ni copiaron estos payloads al repositorio durante la implementación del Centro Operacional. Los JSON en tests/fixtures continúan siendo fixtures sintéticos; no se renombran como reales. Documentar las capturas autorizadas y debidamente redactadas por separado, sin credenciales ni información sensible.

## 20. Problemas y decisiones técnicas

- Supabase PostgreSQL seleccionado por decisión del proyecto, sin servicios adicionales.
- `pg` + `DATABASE_URL`: transacción completa y bloqueos sin RPC/PostgREST ni service-role key. Pool limitado a 1 por instancia, sin prepared statements nombrados.
- Aislamiento aún no demostrado: no se resuelve solo con un filtro local ni una variable.
- Autor puede llegar sin contexto: conservar/reconciliar, no consultar APIs durante ACK.
- Autenticación Basic de laboratorio no equivale a autenticidad de webhook.
- Sin cola en v1: confirmar solo lo persistido y documentar dependencia de disponibilidad de DB.
- No se inicializa ni publica repositorio remoto como parte de esta entrega.

## 21. Limitaciones

POC no productivo: sin SSO, auditoría de usuarios, rate limiter distribuido, cola, recuperación ilimitada, reconciliación por API ni garantía de orden. Basic comparte credenciales entre operadores y el navegador puede recordarlas. Se conserva payload redactado que puede incluir metadatos fuera del contrato interno.

No se prueba aislamiento usando tráfico clínico. `WEBHOOK_INGESTION_ENABLED` es un interruptor explícito, no verifica procedencia sintética ni aislamiento. Una vez habilitado, acepta cualquier solicitud con el sobre autorizado. No registrar suscripciones reales antes de resolver el bloqueo.

## 22. Salud 360 — tarea separada

Posteriormente instalar widget oficial en `/livechat-poc`, con license ID y group ID de pruebas confirmados. Revisar instrucciones vigentes del widget y evitar una segunda instalación global o reglas de enrutamiento que deriven a operación real. No se modifica ese repositorio aquí.

## 23. Próximos pasos y evolución futura

1. Usuario crea/conecta Supabase y aplica migración; verifica fixtures y lab.
2. Usuario despliega Vercel y comprueba HTTPS/acceso/persistencia.
3. Confirmar aislamiento en origen y documentar evidencia.
4. Completar Private App, autorización, permisos, IDs y dos suscripciones.
5. Ejecutar TEST 01–08 con mensajes ficticios y documentar observaciones.

El futuro agente IA consumiría `InternalChatEvent v1`, no JSON LiveChat. Antes de agregarlo se necesitarían un mecanismo durable de entrega (por ejemplo outbox/cola), política de reintentos, versión de contrato y un adaptador de salida separado. Nada de ello está implementado en este POC receptor.

## Referencias oficiales

- [Webhooks y formatos](https://platform.text.com/docs/management/webhooks/)
- [Estructuras de datos](https://platform.text.com/docs/messaging/agent-chat-api/data-structures)
- [Configuration API y filtros](https://platform.text.com/docs/management/configuration-api/)
- [Chat Webhooks en Developer Console](https://platform.text.com/docs/guides/console-guides/chat-webhooks)
- [ACK y reintentos](https://platform.text.com/docs/guides/livechat-apps/)
- [Supabase: conexiones PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

## 24. Actualización OAuth de instalación (2026-10-01)

Se agregó el callback server-side de autorización y las variables `LIVECHAT_CLIENT_ID`, `LIVECHAT_CLIENT_SECRET`, `LIVECHAT_OAUTH_REDIRECT_URI`. El intercambio usa el endpoint oficial de tokens, muestra únicamente la organización recibida y descarta los tokens. No se cambiaron receptor, tablas ni laboratorio. Ver [LIVECHAT_OAUTH.md](LIVECHAT_OAUTH.md). El responsable informó posteriormente que el callback y la recepción real están desplegados. La evidencia de aislamiento debe conservarse; esta actualización no la certifica.

## 25. Centro Operacional (2026-10-02)

Se implementaron dashboard, monitor operacional, conversaciones/timeline, reportes básicos, auditoría, eventos técnicos, grupos/agentes observados y alertas técnicas. Categorías/IA/protocolos son estructuras visuales pendientes. Ver [OPERATIONS_CONSOLE.md](OPERATIONS_CONSOLE.md) para el diseño final, fuentes y matriz métrica → fuente → cálculo → disponibilidad.

No se modifica receptor, OAuth, normalización, idempotencia, escrituras, tablas ni migraciones. Se agrega un lector SQL parametrizado por organización y período. Las listas no cargan raw_payload; solo detalle técnico lo devuelve. El timeline proyecta mensajes de snapshots en SQL, sin enviar el JSON completo. Los datos del visitante permanecen ocultos inicialmente; no se muestra IP.

La protección Basic temporal se amplía a todas las rutas operacionales y `/api/operations/*`; webhook y OAuth conservan acceso independiente. RBAC / autenticación real pendiente antes de entregar acceso formal a una contraparte.

Polling de cinco segundos después de cada consulta, sin solapamiento ni requests en pestaña oculta, con 304 y backoff. Se separan consulta exitosa de PostgreSQL, última entrega y actividad de origen; nunca se declara LiveChat conectado por actividad reciente.

No se determinan cierres/espera/asignación/presencia ni duración final. chat_deactivated es el siguiente webhook propuesto para cierres reales; chat_transferred será una señal futura de derivaciones. Deben agregarse en tarea independiente con documentación oficial y pruebas, sin habilitarlos en esta entrega.

Verificaciones locales: 70 tests, HTTP completo con PostgreSQL temporal, typecheck y build aprobados. No hubo acceso a Supabase alojado ni LiveChat durante esta tarea.
