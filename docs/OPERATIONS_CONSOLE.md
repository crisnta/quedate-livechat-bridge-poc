# Quédate · Centro Operacional

## Estado de esta entrega

Capa de monitoreo, supervisión, reportería y auditoría **de solo lectura respecto de LiveChat**. La atención y las respuestas permanecen en LiveChat. No se llama a Chat API, no se modifica ninguna conversación y no se incorpora IA.

El responsable informó que la recepción real, PostgreSQL, OAuth y los payloads observados ya están probados. Esta entrega no vuelve a configurar ni activar LiveChat, no consulta la base alojada ni certifica el aislamiento. Las verificaciones automatizadas utilizan exclusivamente un PostgreSQL temporal y fixtures sintéticos. Las pantallas de la aplicación consultan los datos de la base configurada, sin fallback a mocks.

## Arquitectura

```text
LiveChat → webhook → Bridge existente → bridge.webhook_events
                                      → bridge.chat_context
                                                  ↓
                                  operations/repository.ts (SQL)
                                                  ↓
                                    páginas server-side protegidas
                                                  ↓
                    dashboard / conversaciones / reportes / auditoría
                                                  ↓
                  GET /api/operations/monitor → polling del monitor
```

Se conserva `InternalChatEvent v1` como frontera para una integración futura. El endpoint, la autorización OAuth, el secreto de recepción, la normalización, la idempotencia y las transacciones de escritura no se modifican. El único ajuste en el repositorio existente es la proyección explícita de columnas de `listEvents()` para evitar cargar `raw_payload` en el laboratorio legado.

No se agregan tablas, views, migraciones, dependencias, Supabase Realtime, Auth o almacenamiento de tokens. Se reutiliza `pg`, `DATABASE_URL`, el pool existente y el esquema privado `bridge`. Todas las consultas nuevas delimitan `organization_id` con `LIVECHAT_ORGANIZATION_ID` en servidor. Esto no constituye un sistema multiempresa ni RBAC.

## Navegación y módulos

La estética usa morado, lavanda y turquesa como referencia de la página pública de Quédate; sidebar sobrio, área clara, tipografía del sistema, cards discretas y estados técnicos. No se incorpora un logo oficial inventado. La interfaz funciona en desktop y adapta navegación/tablas en pantallas pequeñas.

- **Inicio · `/dashboard`:** resumen del período, cuatro indicadores, gráficos por día/hora, grupos detectados, actividad reciente sin contenido personal y evidencia separada de servicios. La página raíz redirige aquí.
- **Operación · `/monitor`:** Monitor operacional. Lista de conversaciones con previews de mensajes, timeline y contexto; selector de chat, filtros, actualización automática cada cinco segundos, pausa y actualización manual.
- **Operación · `/conversations`:** tabla paginada de 25 chats, filtros por fechas/chat/grupo/agente y respuesta observada; orden por actividad, primera recepción o mensajes. Exportación deshabilitada.
- **Operación · `/conversations/[chatId]`:** timeline de hasta 100 eventos por página; filtro por thread; customer/agent/system/unknown; contexto y datos del visitante ocultos inicialmente. No ofrece caja de respuesta.
- **Análisis · `/reports`:** períodos Hoy/7/30 días o personalizado, conteos observados, gráficos y matriz métrica → fuente → cálculo → disponibilidad. No calcula métricas sin respaldo.
- **Análisis · `/categories`:** Próximamente; categorización no habilitada.
- **Supervisión · `/alerts`:** normalizaciones no soportadas, autores pendientes y entregas repetidas verificables. Error de consulta de PostgreSQL visible. Un duplicado es evidencia de idempotencia, no necesariamente un fallo.
- **Supervisión · `/agents`:** autores agente observados, ID enmascarado si parece correo, chats, mensajes y última recepción. No muestra nombres inventados, presencia ni asignación actual.
- **Supervisión · `/groups`:** IDs detectados en contexto, chats distintos y última recepción; nombres no instrumentados.
- **Control · `/audit`:** eventos persistidos paginados, identidades, fechas, normalización y entregas. Permite abrir el detalle técnico. No es auditoría de accesos humanos.
- **Control · `/technical/events`:** listado de 50 eventos por página, filtros y enlace a detalle.
- **Control · `/technical/events/[id]`:** metadata, errores de normalización y JSON completo redactado.
- **Evolución · `/ai`:** No habilitada; resumen/categoría/señales/revisión humana futuros.
- **Evolución · `/protocols`:** Próximamente; sin lógica clínica.
- **Compatibilidad · `/webhook-lab` y sus detalles:** continúan operativos con Basic, filtros, cursor y JSON técnico. Conservan horas UTC; el Centro Operacional usa Santiago.

En espera y Cerradas no son módulos operativos habilitados: no hay evidencia suficiente para construirlos. Configuración editable, perfil y sesiones individuales tampoco se simulan.

## Modelo de lectura y queries añadidas

Implementadas en `src/lib/operations/repository.ts`, con tipos en `types.ts` y acceso server-only en `server.ts`:

1. **`health()`**: máximos de última entrega (`last_received_at`), fecha de origen disponible (`created_at`), recepción por acción y primera recepción. Firma de revisión con cantidad de filas, suma de entregas y actualización de contexto para invalidar el ETag incluso ante entregas fuera de orden.
2. **`overview(filters)`**: una consulta con CTEs para conteos, chats con/sin respuesta de agente observada, buckets diarios y horarios, grupos y calidad de normalización. No devuelve payloads.
3. **`conversations(filters, preview)`**: agregación por chat de registros del período, grupos/contexto y autores observados. Límite 26 para devolver 25 y `hasMore`; orden estable con desempate por ID. Preview textual de hasta 140 caracteres solamente para el monitor.
4. **`events(filters)`**: columnas explícitas, límite 51 para devolver 50; orden recepción/UUID. Sin `raw_payload` ni perfiles de visitante.
5. **`event(id)`**: un evento por UUID y organización; única lectura del payload completo en la sección técnica nueva. Redacción adicional antes de renderizar.
6. **`detail(chatId, page, thread)`**: tres consultas: contexto técnico, intervalo de recepciones y timeline paginado. Une eventos normalizados con proyección de eventos del snapshot inicial. PostgreSQL extrae únicamente ID/tipo/autor/texto/fechas; nunca devuelve el JSON completo del snapshot a esta vista. Excluye del snapshot los eventos cuya identidad ya está persistida como `incoming_event`.
7. **`visitor(chatId)`**: acceso explícito mediante `?visitor=1`; proyección de participantes customer del último snapshot. Solo devuelve alias/correo si existen; no IP ni dispositivo.
8. **`agents(filters)`**: agrupación de autores de tipo agent; paginación de 25. Los identificadores similares a correos se enmascaran antes de salir del lector.
9. **`groups(filters)`**: expansión de IDs de grupos en contexto, conteo de chats distintos y última recepción; paginación de 25.

El CTE compartido limita organización, fechas, búsqueda literal por chat, grupo detectado y agente observado. Las entradas van como parámetros SQL. El orden se elige de una lista cerrada. No se interpolan valores del usuario ni se agregan statements preparados nombrados.

El filtro de agente indica evidencia de autor en el thread, no asignación vigente. El filtro de respuesta y el orden por mensajes pertenecen al listado de conversaciones/monitor; no se ofrecen como controles engañosos en auditoría/eventos.

Períodos máximos de 366 días y página validada. Paginación con OFFSET apropiada para este POC; al crecer, medir y evaluar cursores e índices en una migración nueva. No se propone una view o un índice sin evidencia de carga. Los filtros no consultan catálogos externos.

## Matriz de métricas

La definición visible también vive en `src/lib/operations/metrics.ts`.

- **Conversaciones con actividad → webhook_events → COUNT(DISTINCT chat_id) en período de recepción → disponible.** No equivale a chats iniciados ni chats activos.
- **Threads recibidos → incoming_chat → COUNT de capturas deduplicadas → disponible.** Un chat puede tener varios threads; no equivale a chats nuevos.
- **Mensajes usuario → incoming_event, message, customer → COUNT filas lógicas → disponible para la captura.**
- **Mensajes agente → incoming_event, message, agent → COUNT filas lógicas → disponible para la captura.**
- **Autor desconocido → incoming_event, message, unknown → COUNT filas → disponible.** No se atribuye a customer por defecto.
- **Con respuesta observada → message, agent → chats distintos con mensaje agente en período → disponible.**
- **Sin respuesta observada → chats del período sin mensaje agente capturado → disponible como observación.** No implica chat sin atender o sin agente.
- **Conversaciones por día/hora → received_at → COUNT DISTINCT por bucket Santiago → disponible.** El mismo chat puede aparecer en varios buckets; los valores no son aditivos respecto del total único. La gráfica horaria acumula horas locales del período.
- **Mensajes por hora → incoming_event/message/received_at → COUNT por hora local → disponible.**
- **Grupos → chat_context.group_ids → chats distintos por grupo → disponible si se capturó contexto.** Un chat puede pertenecer a varios grupos; no se suman como total único.
- **Entregas repetidas → delivery_count → SUM(delivery_count - 1) → disponible.** Filas seleccionadas por su primera recepción; no son reintentos ocurridos estrictamente dentro del período.
- **Calidad → normalization_status → COUNT unsupported_shape/pending_context → disponible.**
- **Chats iniciados hoy → captura de apertura completa → no disponible como apertura de chat real.** Se muestra recepción de threads.
- **Activo/Cerrado/En espera → señales de estado/routing/cierre → no disponible.**
- **Duración final/Promedio → cierre confirmado → no disponible.** El intervalo primera/última recepción es solo intervalo observado, claramente rotulado.
- **Primera respuesta → secuencia completa por thread y timestamps confiables → pendiente de validar cobertura.** No se muestra un promedio parcial como indicador operacional.
- **Asignación actual/Agente online → señales de asignación/presencia → no disponible.**
- **Categoría/Riesgo/Protocolo → estructura futura → no disponible.**

Los mensajes de snapshots iniciales enriquecen la conversación, pero los indicadores cuentan únicamente filas `incoming_event`, para no mezclar cobertura ni duplicar. Un cero representa cero registros de la captura, no ausencia de operación. Las fechas de reportes son de **recepción**, no del inicio real de la conversación. Una recepción retrasada pertenece al día en que se recibió.

## Estados y evidencia de servicios

No se declara «LiveChat conectado» por recibir webhooks recientes. Se diferencian:

- Última consulta exitosa a PostgreSQL: instante tras completar la consulta.
- Último webhook recibido: máximo `last_received_at`; incluye reintentos.
- Última actividad observada en LiveChat: máximo `created_at` disponible de eventos persistidos; no incluye snapshots sin evento normalizado y puede faltar.
- Recepción Bridge habilitada/deshabilitada: estado del interruptor configurado, no certificación de disponibilidad externa.

Se utilizan «actividad en el período», «respuesta de agente observada», «sin respuesta de agente observada» y «estado no determinado». Los filtros Activo/Cerrado/En espera/Asignado actualmente/Agente online están deshabilitados. No se fabrican transferencias ni cierres en el timeline.

**Siguiente webhook propuesto: `chat_deactivated`.** Incorporarlo en una tarea separada, verificando forma oficial, validación, normalización e idempotencia, para determinar cierres reales y métricas de duración. **`chat_transferred`** será una señal útil futura para derivaciones. No se modifica el allowlist actual en esta entrega.

## Polling

`GET /api/operations/monitor` está protegido y usa solo PostgreSQL. Responde 200 con snapshot o 304 si ETag coincide, después de comprobar PostgreSQL; `X-Checked-At` registra la consulta exitosa. El ETag no incluye el reloj de consulta, por lo que no cambia sin actividad. Consultas adicionales de listado/timeline solo si hay cambios o cambian filtros/selección.

El cliente ejecuta una consulta inicial, luego espera cinco segundos después de completar cada consulta. No hay requests superpuestos ni polling con la pestaña oculta. Ocultar pestaña, pausar o desmontar aborta el request; volver a visible reanuda. Los errores incrementan espera con backoff hasta 60 segundos; se conservan datos anteriores marcados como desactualizados. Una respuesta 304 actualiza el instante de consulta sin volver a transferir la conversación.

El monitor muestra una página de 25 conversaciones y hasta 100 eventos del chat seleccionado, con enlaces al listado/detalle paginados. No pretende cargar toda la historia ni observar el estado remoto en tiempo real.

## Privacidad y acceso

**RBAC / autenticación real pendiente antes de entregar acceso formal a una contraparte.** Basic es protección temporal compartida del POC, no multiusuario ni separación ADMIN/CLIENTE. Las rutas de la consola y su API están protegidas en Proxy; layout/API vuelven a comprobar acceso antes de consultar datos. Webhook y OAuth conservan sus mecanismos propios.

- Listas y agregados no consultan `raw_payload`; tampoco cargan IP, perfiles ni datos del visitante.
- Los snapshots del timeline se proyectan en PostgreSQL, sin enviar el JSON completo al monitor o detalle de conversación.
- Alias/correo del visitante están ocultos y no consultados inicialmente. Se requiere acción explícita para mostrarlos en el detalle; no hay permisos individuales todavía.
- IP y dispositivo no se muestran en dashboard, listas ni contexto.
- El mensaje libre puede contener datos personales: la interfaz no realiza anonimización semántica. Los previews y conversaciones son información sensible; esta entrega no autoriza compartirlos formalmente.
- JSON completo únicamente en detalle técnico o laboratorio técnico legado, ambos protegidos. Se preserva `secret_key = [REDACTED]`; presentación adicional redacta claves relacionadas con secretos, tokens, contraseñas, authorization, client IDs y URLs PostgreSQL/Bearer. No sustituye una revisión de payloads antes de exportar/compartir.
- No hay `dangerouslySetInnerHTML`; React muestra mensajes como texto. No se registran cuerpos, errores SQL, tokens o credenciales en estos módulos.
- Cache-Control privado/no-store; sin indexación. No se agrega caché persistente, exportación ni analítica de terceros.

Antes de acceso cliente: autenticación real, permisos por módulo y organización, autorización del acceso a datos personales/JSON, auditoría de accesos, retención y anonimización. La navegación está preparada conceptualmente para roles futuros; no afirma aislamiento implementado.

## Pruebas y resultados

`npm test`: suite de Bridge/OAuth existente más integración SQL de operaciones y scheduler de polling. Fixtures **sintéticos**, nunca «payload real». PostgreSQL temporal independiente, sin conectar al Supabase configurado. `tests/operations.test.ts` cubre privacidad de proyecciones, organización, SQL parametrizado, paginación, Santiago, threads múltiples, snapshots, autores desconocidos, datos parciales, duplicados, enmascaramiento y métricas pendientes. `tests/polling.test.ts` cubre intervalos, pestaña oculta, aborto, pausa/desmontaje, ausencia de solapamiento y backoff.

`npm run test:e2e`: build y HTTP con Next de producción + PostgreSQL temporal. Verifica todas las rutas protegidas, laboratorio legado, OAuth sin Basic, endpoint de webhooks, monitor 200/304/400/401/503, visitante oculto/acceso explícito, mensajes HTML escapados y redacción técnica. Simula una base realmente detenida al final.

Resultados ejecutados en esta entrega: **70 tests aprobados**, pruebas HTTP completas aprobadas, typecheck y build de producción aprobados. No se certificó Supabase/Vercel ni cobertura histórica real en esta ejecución. Un cache de tipos de desarrollo de Next obsoleto produjo errores de typecheck; se regeneraron solamente artefactos locales, sin cambiar tsconfig ni omitir verificaciones.

## Despliegue

No hay nuevas variables de entorno. Mantener DATABASE_URL, LIVECHAT_ORGANIZATION_ID, WEBHOOK_LAB_USERNAME/PASSWORD y variables existentes. No usar `NEXT_PUBLIC_*` para credenciales. Aplicar únicamente `001_initial.sql` si la base todavía no tiene la migración original; no volver a ejecutarla como actualización de esta consola. Desplegar el código normalmente en Vercel y revisar `/dashboard` y `/monitor` por HTTPS con Basic. No activar/registar nuevas suscripciones como parte del despliegue.

## Fases y próximos pasos

- Fase 1 · Webhook Bridge: completado según validación informada por el responsable; conservar evidencia.
- Fase 2 · Monitor operacional: entrega actual implementada.
- Fase 3 · Reportería: entrega actual básica sobre captura existente.
- Fase 4 · Clasificación IA: futura.
- Fase 5 · Agente IA: futura y desarrollada por otro equipo.
- Fase 6 · Automatización/respuestas: futura, requiere autorización y diseño separado.

Primero validar los módulos contra la base del POC en Vercel con sesiones ficticias autorizadas; registrar cobertura, latencia, costo de consultas y comportamiento de varios threads. Medir carga antes de proponer índices/views/materializaciones. Agregar cierres en tarea independiente. Luego resolver autenticación/RBAC/privacidad antes de contraparte; después catálogos de grupos/agentes y reportería de aperturas/cierres con cobertura suficiente. La futura IA consumirá un contrato interno versionado y agregaría sus propias estructuras; nunca se acoplará al endpoint ni al JSON de LiveChat directamente.
