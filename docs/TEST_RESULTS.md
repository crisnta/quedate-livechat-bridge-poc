# Resultados de verificación

Fecha: 2026-09-30. Entorno: macOS arm64, Node.js 24.19.0. Datos exclusivamente sintéticos.

## Ejecutado

- `npm test`: **24 tests aprobados**. PostgreSQL 18 temporal real mediante `embedded-postgres`. Cada test vacía solo sus tablas temporales. Concurrencia con conexiones independientes y restricción única real.
- `npm run typecheck`: aprobado, sin errores TypeScript.
- `npm run test:e2e`: build de producción y smoke HTTP aprobados. Levanta Next.js y PostgreSQL en loopback con credenciales sintéticas generadas/configuradas por el propio test. Verifica ambos fixtures, lista, detalle, filtro por chat, persistencia consultada desde SQL, contador de duplicados, secreto redactado y Basic.
- Caída de DB en smoke: se apaga realmente PostgreSQL y el endpoint devuelve 503.
- `npm install` reportó cero vulnerabilidades conocidas en su auditoría al instalar las dependencias. No equivale a auditoría de seguridad del proyecto.

## Alcance de las aserciones

Validación: secreto, organización, suscripción, JSON, acción, tamaño y recepción deshabilitada. Normalización: chat/evento, customer/agente, autor desconocido, mensaje sin texto, campos adicionales, fallback, contexto tardío/concurrente y eventos iniciales sin fabricar recepciones. Persistencia: duplicado secuencial/concurrente y ACK posterior al guardado. Seguridad: redacción recursiva sin mutar entrada, Basic y escape HTML en render React.

## Incidencias del entorno

El primer intento dentro del sandbox no pudo abrir el puerto local (`EPERM`); los tests no llegaron a ejecutarse. Se repitieron con permiso para loopback y pasaron. La descarga inicial de npm necesitó acceso de red autorizado. No se conectó a ningún servicio de LiveChat ni base externa.

## No ejecutado / pendiente

- Conexión a Supabase alojado, TLS, pooler y permisos de la cuenta del usuario.
- Migración en Supabase, deploy Vercel y persistencia tras redeploy externo.
- Inspección visual manual en navegador; sí se comprobó HTML servido por Next y escape de contenido.
- Widget, Private App, scopes efectivos, instalación, suscripciones o recepción real.
- Aislamiento del tráfico de pruebas: **BLOQUEANTE para activación real**.

No se afirma recepción real ni aceptación contra Supabase. La siguiente evidencia necesaria es ejecutar `fixtures:send` contra el despliegue conectado al proyecto Supabase y registrar el resultado sin secretos.

## Actualización OAuth — 2026-10-01

- `npm test`: **39 tests aprobados** en dos archivos (24 existentes + 15 casos OAuth).
- `npm run build`: aprobado, incluyendo TypeScript y la nueva ruta dinámica `/api/livechat/oauth/callback`.
- Los tests OAuth simulan el endpoint de tokens; no se conectaron a LiveChat ni usaron credenciales reales.
- No se ejecutó una instalación real ni se observaron tokens/organización de la cuenta. La configuración en Developer Console y Vercel es manual y permanece pendiente.
