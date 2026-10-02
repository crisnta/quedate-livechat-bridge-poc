export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function oauthConfig(): OAuthConfig {
  const clientId = process.env.LIVECHAT_CLIENT_ID;
  const clientSecret = process.env.LIVECHAT_CLIENT_SECRET;
  const redirectUri = process.env.LIVECHAT_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("OAuth configuration incomplete");
  }
  const uri = new URL(redirectUri);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname);
  if (
    (uri.protocol !== "https:" && !(local && uri.protocol === "http:")) ||
    uri.username ||
    uri.password ||
    uri.search ||
    uri.hash ||
    uri.pathname !== "/api/livechat/oauth/callback"
  ) {
    throw new Error("Invalid OAuth redirect URI");
  }
  return { clientId, clientSecret, redirectUri };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

function page(
  status: number,
  title: string,
  message: string,
  organizationId?: string,
): Response {
  const organization = organizationId
    ? `<p>organization_id: <code>${escapeHtml(organizationId)}</code></p><p>Anota este identificador para configurar LIVECHAT_ORGANIZATION_ID. No se ha modificado ninguna variable.</p>`
    : "";
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p>${organization}<p>Los tokens no se almacenan ni se muestran. Puedes cerrar esta ventana.</p></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Security-Policy":
          "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    },
  );
}

// Tokens exist only in this request's memory. No database, cookies, token refresh,
// account binding or Chat API calls are involved in this installation callback.
export function createOAuthCallback(
  getConfig: () => OAuthConfig = oauthConfig,
  fetchToken: typeof fetch = fetch,
) {
  return async function GET(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    if (params.has("error")) {
      return page(
        400,
        "Autorización no completada",
        "LiveChat no completó la autorización. Revisa la instalación privada e inténtalo nuevamente.",
      );
    }
    const codes = params.getAll("code");
    if (codes.length !== 1 || !codes[0].trim() || codes[0].length > 4096) {
      return page(
        400,
        "Código requerido",
        "Se requiere un único parámetro code válido enviado por LiveChat.",
      );
    }
    let config: OAuthConfig;
    try {
      config = getConfig();
    } catch {
      return page(
        503,
        "Configuración pendiente",
        "Configura las variables OAuth del servidor y vuelve a iniciar la instalación.",
      );
    }
    try {
      const response = await fetchToken(
        "https://accounts.livechat.com/v2/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: codes[0],
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
          }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        // Do not reflect or log upstream error bodies (may contain credentials).
        await response.body?.cancel();
        return page(
          502,
          "Intercambio no completado",
          "LiveChat rechazó el intercambio. Revisa la configuración e inicia una nueva autorización; el código es de un solo uso.",
        );
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error("Invalid token response");
      const token = result as Record<string, unknown>;
      if (
        typeof token.access_token !== "string" ||
        !token.access_token ||
        typeof token.organization_id !== "string" ||
        !token.organization_id ||
        token.organization_id.length > 512
      )
        throw new Error("Invalid token response");
      return page(
        200,
        "Autorización exitosa",
        "LiveChat completó el intercambio de autorización de Quédate LiveChat Bridge POC. Esta confirmación no certifica el aislamiento ni la recepción de webhooks.",
        token.organization_id,
      );
    } catch {
      return page(
        502,
        "Intercambio no completado",
        "No fue posible completar el intercambio con LiveChat. Inicia una nueva autorización y revisa la configuración del servidor.",
      );
    }
  };
}
