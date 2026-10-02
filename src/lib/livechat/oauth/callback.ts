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

type Diagnostics = {
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  redirectUri: string;
  httpStatus?: number;
  error?: string;
  errorDescription?: string;
};

// Diagnostic values are displayed only, never written to application logs.
function configurationDiagnostics(config?: OAuthConfig): Diagnostics {
  const redirect =
    config?.redirectUri ?? process.env.LIVECHAT_OAUTH_REDIRECT_URI;
  let safeRedirect = "No disponible";
  try {
    const uri = new URL(redirect ?? "");
    if (
      ["https:", "http:"].includes(uri.protocol) &&
      !uri.username &&
      !uri.password &&
      !uri.search &&
      !uri.hash
    ) {
      safeRedirect = redactDiagnostic(redirect!, [
        config?.clientId,
        config?.clientSecret,
        process.env.LIVECHAT_CLIENT_ID,
        process.env.LIVECHAT_CLIENT_SECRET,
      ]);
    }
  } catch {
    /* Never reflect malformed URIs, which may contain credentials. */
  }
  return {
    clientIdConfigured: Boolean(
      config?.clientId ?? process.env.LIVECHAT_CLIENT_ID,
    ),
    clientSecretConfigured: Boolean(
      config?.clientSecret ?? process.env.LIVECHAT_CLIENT_SECRET,
    ),
    redirectUriConfigured: Boolean(redirect),
    redirectUri: safeRedirect,
  };
}

function redactDiagnostic(
  value: string,
  secrets: (string | undefined)[],
): string {
  const variants = secrets
    .filter((v): v is string => Boolean(v))
    .flatMap((v) => [
      v,
      encodeURIComponent(v),
      new URLSearchParams({ v }).toString().slice(2),
      JSON.stringify(v).slice(1, -1),
    ]);
  let safe = value;
  for (const secret of [...new Set(variants)].sort(
    (a, b) => b.length - a.length,
  ))
    safe = safe.split(secret).join("[REDACTED]");
  // Also redact credential assignments echoed by the provider, including tokens
  // not known to this callback. No complete upstream body is ever rendered.
  safe = safe.replace(
    /((?:client_id|client_secret|code|access_token|refresh_token)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&,;<>]+)/gi,
    "$1[REDACTED]",
  );
  return safe.slice(0, 1024);
}

async function providerDiagnostics(
  response: Response,
  config: OAuthConfig,
  code: string,
): Promise<Partial<Diagnostics>> {
  const diagnostic: Partial<Diagnostics> = { httpStatus: response.status };
  let result: unknown;
  // Bound the error body and discard non-JSON responses without displaying them.
  const reader = response.body?.getReader();
  if (!reader) return diagnostic;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) {
        await reader.cancel();
        return diagnostic;
      }
      chunks.push(value);
    }
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return diagnostic;
  } finally {
    reader.releaseLock();
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    return diagnostic;
  const body = result as Record<string, unknown>;
  const secrets: (string | undefined)[] = [
    config.clientId,
    config.clientSecret,
    code,
  ];
  function collect(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (
        /^(client_id|client_secret|code|access_token|refresh_token)$/i.test(
          key,
        ) &&
        typeof item === "string"
      )
        secrets.push(item);
      else if (typeof item === "object") collect(item);
    }
  }
  collect(body);
  if (typeof body.error === "string")
    diagnostic.error = redactDiagnostic(body.error, secrets);
  if (typeof body.error_description === "string")
    diagnostic.errorDescription = redactDiagnostic(
      body.error_description,
      secrets,
    );
  return diagnostic;
}

function diagnosticHtml(d: Diagnostics): string {
  const rows: [string, string][] = [
    ["LIVECHAT_CLIENT_ID configurado", d.clientIdConfigured ? "sí" : "no"],
    [
      "LIVECHAT_CLIENT_SECRET configurado",
      d.clientSecretConfigured ? "sí" : "no",
    ],
    [
      "LIVECHAT_OAUTH_REDIRECT_URI configurado",
      d.redirectUriConfigured ? "sí" : "no",
    ],
    ["redirect_uri efectivo", d.redirectUri],
  ];
  if (d.httpStatus !== undefined)
    rows.push(["HTTP status", String(d.httpStatus)]);
  if (d.error !== undefined) rows.push(["error", d.error]);
  if (d.errorDescription !== undefined)
    rows.push(["error_description", d.errorDescription]);
  return (
    "<section><h2>Diagnóstico temporal</h2><dl>" +
    rows
      .map(([key, value]) => `<dt>${key}</dt><dd>${escapeHtml(value)}</dd>`)
      .join("") +
    "</dl></section>"
  );
}

function page(
  status: number,
  title: string,
  message: string,
  organizationId?: string,
  diagnostics?: Diagnostics,
): Response {
  const organization = organizationId
    ? `<p>organization_id: <code>${escapeHtml(organizationId)}</code></p><p>Anota este identificador para configurar LIVECHAT_ORGANIZATION_ID. No se ha modificado ninguna variable.</p>`
    : "";
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p>${organization}${diagnostics ? diagnosticHtml(diagnostics) : ""}<p>Los tokens no se almacenan ni se muestran. Puedes cerrar esta ventana.</p></main></body></html>`,
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
        undefined,
        configurationDiagnostics(),
      );
    }
    const diagnostics = configurationDiagnostics(config);
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
        const failure = await providerDiagnostics(response, config, codes[0]);
        return page(
          502,
          "Intercambio no completado",
          "LiveChat rechazó el intercambio. Revisa la configuración e inicia una nueva autorización; el código es de un solo uso.",
          undefined,
          { ...diagnostics, ...failure },
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
        diagnostics,
      );
    } catch {
      return page(
        502,
        "Intercambio no completado",
        "No fue posible completar el intercambio con LiveChat. Inicia una nueva autorización y revisa la configuración del servidor.",
        undefined,
        diagnostics,
      );
    }
  };
}
