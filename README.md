# Quédate LiveChat Bridge POC

Receptor y observador de `incoming_chat` / `incoming_event`. Next.js + TypeScript + PostgreSQL en Supabase. Sin IA, respuestas automáticas ni escritura a LiveChat. Repositorio independiente de Salud 360.

**Activación real BLOQUEADA:** aún no se ha comprobado el aislamiento del tráfico de pruebas. No registrar webhooks de la operación real. `WEBHOOK_INGESTION_ENABLED=false` es el valor inicial. Habilitarlo para fixtures no certifica aislamiento.

## Requisitos

- Node.js 22 o superior y npm.
- Proyecto Supabase propio para el POC; solo PostgreSQL.
- Para pruebas automatizadas: plataforma soportada por `embedded-postgres`, permisos de ejecutar sus binarios y abrir un puerto de loopback. No necesita Docker ni Supabase.

## Configuración y migración

```sh
npm ci
cp .env.example .env.local
```

En Supabase → Connect, copiar la URL del **Transaction pooler** en `DATABASE_URL`. Codificar caracteres especiales de la contraseña en la URL. Usar TLS con verificación de certificado (`sslmode=verify-full`; configurar CA si el entorno lo requiere). No desactivar verificación TLS. Nunca compartir la URL en Git, capturas o logs.

El cliente `pg` usa parámetros sin statements nombrados, pool máximo de una conexión por instancia y transacciones explícitas. No necesita `SUPABASE_URL` ni `SUPABASE_SERVICE_ROLE_KEY`.

Ejecutar `db/migrations/001_initial.sql` en el SQL Editor de Supabase **o**, tras configurar la conexión local:

```sh
npm run db:migrate
```

La migración crea el esquema privado `bridge`, tablas, índices y RLS. Para el POC se utiliza la conexión del propietario de estas tablas. Un usuario SQL distinto requerirá grants y políticas explícitas. No exponer el esquema `bridge` por la Data API. No se utiliza una clave de servicio ni Supabase Auth.

## Prueba sintética local

En `.env.local`, además de la base y credenciales del laboratorio, usar valores de prueba:

```dotenv
LIVECHAT_WEBHOOK_SECRET=synthetic-secret-only
LIVECHAT_ORGANIZATION_ID=synthetic-org
LIVECHAT_INCOMING_CHAT_WEBHOOK_ID=synthetic-chat-hook
LIVECHAT_INCOMING_EVENT_WEBHOOK_ID=synthetic-event-hook
LIVECHAT_TEST_GROUP_ID=999999
WEBHOOK_INGESTION_ENABLED=true
```

Estos valores son ficticios. Elegir usuario y contraseña propios para el laboratorio. El grupo configurado es referencia operativa, **no un filtro garantizado** del receptor.

```sh
npm run dev
# En otra terminal:
npm run fixtures:send
```

Abrir `http://localhost:3000/webhook-lab` e ingresar las credenciales Basic. Solo localhost utiliza HTTP; en despliegues usar HTTPS.

Enviar nuevamente los fixtures incrementa `delivery_count`; no crea nuevas filas lógicas. El script carga `.env.local`, sustituye únicamente las credenciales/IDs del sobre y no imprime secretos. No crea conversaciones ni llama a LiveChat. Para inspeccionar el ACK directamente se puede enviar el JSON de `tests/fixtures` al endpoint con `curl`, usando exclusivamente estos valores sintéticos.

## Comprobaciones

```sh
npm test
npm run typecheck
npm run test:e2e
# test:e2e incluye build de producción y pruebas HTTP completas.
```

Los tests crean un PostgreSQL temporal local, aplican la migración y prueban el handler y SQL reales, incluyendo conexiones simultáneas. Eliminan solamente su cluster temporal al terminar. No leen `DATABASE_URL` para los tests ni conectan a Supabase. En entornos que bloquean scripts de instalación, autorizar únicamente los scripts requeridos por `embedded-postgres` y `esbuild` antes de ejecutar.

## Vercel

1. Crear un repositorio Git privado independiente e importar este proyecto en Vercel (preset Next.js).
2. Crear Supabase para el POC, aplicar la migración y elegir regiones cercanas para función y base.
3. Configurar las variables de `.env.example` en Vercel. Usar valores sintéticos inicialmente, credenciales Basic fuertes y `WEBHOOK_INGESTION_ENABLED=true` únicamente para la prueba autorizada de fixtures.
4. Desplegar con `npm run build`. No registrar webhooks reales.
5. Comprobar el laboratorio por HTTPS y ejecutar `npm run fixtures:send -- https://TU-PROYECTO.vercel.app` desde el entorno local sintético correspondiente.
6. Repetir el envío; verificar conteo de entregas y persistencia tras refresh y redeploy.

La protección global de Vercel puede bloquear las pruebas de POST: configurar el acceso del despliegue de POC conscientemente. Basic protege exclusivamente el laboratorio; el webhook se autentica con su secreto. No colocar secretos en URLs. Separar base/credenciales de previews. Las migraciones no corren automáticamente durante el build.

## Estado y siguientes pasos

Implementación y pruebas sintéticas locales; conexión a Supabase, despliegue Vercel y payloads reales pendientes de ejecución por el responsable de las cuentas. Seguir [la documentación técnica](docs/LIVECHAT_POC.md) para evidencias, límites y configuración manual de LiveChat.

## Instalación privada: callback OAuth de LiveChat

Se agregó `GET /api/livechat/oauth/callback` para la app **Server-side**. Configurar en el servidor:

```dotenv
LIVECHAT_CLIENT_ID=
LIVECHAT_CLIENT_SECRET=
LIVECHAT_OAUTH_REDIRECT_URI=https://quedate-livechat-bridge-poc.vercel.app/api/livechat/oauth/callback
```

En Developer Console, configurar esa misma URL como **Direct installation URL** y en **Redirect URI whitelist**. El usuario inicia **Private installation → Install app**; LiveChat redirige al callback con un `code` de un solo uso. El servidor lo intercambia por tokens usando POST form-urlencoded a `https://accounts.livechat.com/v2/token`.

La respuesta muestra autorización exitosa y el `organization_id` recibido desde el endpoint de tokens. Anotar ese ID manualmente en `LIVECHAT_ORGANIZATION_ID`, sin copiar tokens. El callback no modifica variables ni consulta PostgreSQL. No se requieren las credenciales del laboratorio para abrirlo.

**No se conservan access_token ni refresh_token.** Los Chat Webhooks de Developer Console se habilitan con la instalación/autorización y sus entregas usan `secret_key`. Como este POC no llama a APIs de LiveChat después de autorizar, almacenar/renovar tokens no aporta funcionalidad. Si en una fase futura se necesitan esas APIs, se diseñará almacenamiento seguro y renovación por separado.

La autorización exitosa no prueba el aislamiento ni la recepción. Instalar una app con suscripciones ya configuradas puede habilitarlas: mantener el requisito bloqueante de aislamiento antes de instalar contra la operación real. Este cambio no registra ni activa suscripciones por código.

Pruebas OAuth usan respuestas simuladas y credenciales sintéticas; no realizan llamadas a LiveChat. Ver [docs/LIVECHAT_OAUTH.md](docs/LIVECHAT_OAUTH.md) para configuración, límites y referencias.
