# Instalación privada OAuth — Quédate LiveChat Bridge POC

Implementado el 2026-10-01. Solo callback de autorización para la app configurada como **Server-side app**. Sin cambios al receptor, PostgreSQL o laboratorio.

## Flujo

1. Configurar las tres variables OAuth en el servidor/Vercel.
2. Registrar en App Authorization la URL exacta tanto en Direct installation URL como Redirect URI whitelist:
   `https://quedate-livechat-bridge-poc.vercel.app/api/livechat/oauth/callback`.
3. Revisar los permisos configurados en la consola; este cambio no agrega scopes ni requiere permisos de envío.
4. Iniciar la instalación privada desde Developer Console únicamente en un entorno con aislamiento comprobado si ya hay webhooks registrados.
5. LiveChat redirige con un `code` de un solo uso. El callback valida que haya exactamente uno, no vacío.
6. POST server-side a `https://accounts.livechat.com/v2/token` con `Content-Type: application/x-www-form-urlencoded` y `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri`.
7. Si LiveChat devuelve una respuesta válida con access token y organización, mostrar confirmación y únicamente `organization_id`. Los tokens se descartan al terminar la solicitud.

`redirect_uri` proviene de configuración, nunca del navegador. Para localhost se admite HTTP; cualquier host remoto requiere HTTPS. El URI no puede contener credenciales, query ni fragmento y su path debe ser el del callback.

## Decisión sobre tokens

**No hay almacenamiento de tokens**, tablas nuevas, cookies ni refresh flow. La documentación de Chat Webhooks establece que las suscripciones configuradas en Developer Console se habilitan para las licencias que instalan y autorizan la aplicación. Las entregas posteriores se autentican con el secreto del webhook, no con access tokens OAuth.

La conclusión para este POC receptor es que no hace falta conservar tokens, porque no se realizan llamadas posteriores a Configuration API o Chat API. No significa que una integración futura que haga esas llamadas pueda prescindir de ellos. La guía general OAuth recomienda guardarlos cuando se usarán para APIs; ese uso no pertenece a esta fase.

## organization_id recibido

Se toma del JSON devuelto por el endpoint de tokens y se muestra escapado en la confirmación. No se toma del query, no se registra en logs ni se escribe automáticamente en `LIVECHAT_ORGANIZATION_ID`. El operador debe anotarlo y configurar la allowlist manualmente.

**Todavía no hay organization_id observado de una autorización real en esta implementación.** Los tests utilizan `synthetic-org`; no corresponde a una cuenta. No documentar tokens, secretos o URLs que contengan códigos como evidencia.

## Respuestas y seguridad

- 200: intercambio completado; confirmación simple, organización y aviso de tokens no conservados.
- 400: código ausente/vacío/repetido o error OAuth devuelto en el callback.
- 503: variables OAuth incompletas o URI inválido.
- 502: rechazo del intercambio, respuesta malformada, timeout o fallo de red. Iniciar nueva autorización; no reintentar automáticamente un código consumido.

Fetch con timeout de diez segundos, sin caché y sin seguir redirects. Ningún cuerpo de error del proveedor ni excepción se refleja o registra. No se muestra client secret, access token, refresh token ni código. HTML escapado, política CSP restrictiva, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` y no indexación.

El callback es público para permitir el redirect de instalación; Basic sigue limitado al laboratorio. No crea sesiones, no vincula identidades ni modifica configuración. Es un callback mínimo del flujo directo iniciado por LiveChat. No se implementa un iniciador propio ni correlación `state`/PKCE. La guía documenta PKCE como opción para servidor confidencial y recomienda `state` al iniciar autorización. Si se añade inicio propio, login o vinculación persistente, se debe incorporar protección de correlación antes de ese uso. No reutilizar este callback como autenticación de usuarios.

Evitar registrar query strings del callback en herramientas de observabilidad externas: el código de autorización viaja en la URL. El código de aplicación no lo registra.

## Pruebas y estado

Tests OAuth con fetch simulado: código ausente/duplicado, denegación, parámetros de intercambio, confidencialidad, organización escapada, configuración incompleta, errores del proveedor/red y respuesta incompleta. No se usaron credenciales reales ni se llamó al endpoint de LiveChat durante los tests.

Pendiente: configurar variables privadas en Vercel, desplegar y ejecutar instalación real manualmente en entorno autorizado. No considerar la pantalla de éxito como prueba de scopes efectivos, aislamiento o recepción. La activación de webhooks de licencia puede ocurrir automáticamente al instalar la app: revisar las suscripciones antes de hacerlo.

## Referencias oficiales consultadas

- [Authorization code grant: parámetros del intercambio, organización y opciones PKCE/state](https://platform.text.com/docs/authorization/oauth-authorization/)
- [Chat Webhooks: server-side, Direct installation URL, instalación privada y habilitación automática](https://platform.text.com/docs/guides/console-guides/chat-webhooks)
