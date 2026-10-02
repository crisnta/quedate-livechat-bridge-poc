import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createOAuthCallback,
  oauthConfig,
} from "../src/lib/livechat/oauth/callback";

const config = {
  clientId: "synthetic-client",
  clientSecret: "synthetic-client-secret",
  redirectUri: "https://poc.example.invalid/api/livechat/oauth/callback",
};
const request = (query: string) => new Request(config.redirectUri + query);
const tokens = {
  access_token: "synthetic-access-token",
  refresh_token: "synthetic-refresh-token",
  organization_id: "synthetic-org",
};
afterEach(() => vi.unstubAllEnvs());

describe("LiveChat server-side OAuth callback", () => {
  it.each([
    "",
    "?code=",
    "?code=%20",
    "?code=one&code=two",
    "?error=access_denied&code=test",
  ])(
    "rejects invalid or denied callback %s without fetching",
    async (query) => {
      const fetchToken = vi.fn<typeof fetch>();
      const response = await createOAuthCallback(
        () => config,
        fetchToken,
      )(request(query));
      expect(response.status).toBe(400);
      expect(fetchToken).not.toHaveBeenCalled();
    },
  );
  it("exchanges the code as form data and exposes only organization_id", async () => {
    const fetchToken = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(tokens));
    const response = await createOAuthCallback(
      () => config,
      fetchToken,
    )(request("?code=dal%3Asynthetic-code"));
    expect(response.status).toBe(200);
    const [url, options] = fetchToken.mock.calls[0];
    expect(url).toBe("https://accounts.livechat.com/v2/token");
    expect(options?.method).toBe("POST");
    expect(options?.redirect).toBe("error");
    expect(options?.cache).toBe("no-store");
    expect(Object.fromEntries(options?.body as URLSearchParams)).toEqual({
      grant_type: "authorization_code",
      code: "dal:synthetic-code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    });
    const html = await response.text();
    expect(html).toContain("Autorización exitosa");
    expect(html).toContain(tokens.organization_id);
    for (const secret of [
      config.clientSecret,
      tokens.access_token,
      tokens.refresh_token,
      "dal:synthetic-code",
    ])
      expect(html).not.toContain(secret);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("escapes organization_id rather than rendering markup", async () => {
    const fetchToken = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...tokens,
        organization_id: "<script>alert(1)</script>",
      }),
    );
    const html = await (
      await createOAuthCallback(
        () => config,
        fetchToken,
      )(request("?code=synthetic"))
    ).text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("handles missing configuration without sending a request", async () => {
    const fetchToken = vi.fn<typeof fetch>();
    const response = await createOAuthCallback(() => {
      throw new Error(config.clientSecret);
    }, fetchToken)(request("?code=synthetic"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(config.clientSecret);
    expect(fetchToken).not.toHaveBeenCalled();
  });
  it("does not reflect upstream errors or log tokens", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchToken = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(tokens, { status: 400 }));
      const response = await createOAuthCallback(
        () => config,
        fetchToken,
      )(request("?code=synthetic"));
      expect(response.status).toBe(502);
      const html = await response.text();
      expect(html).not.toContain(tokens.access_token);
      expect(html).not.toContain(tokens.refresh_token);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
  it.each([null, {}, { access_token: "test" }, { organization_id: "test" }])(
    "rejects incomplete success responses %j",
    async (body) => {
      const fetchToken = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(body));
      expect(
        (
          await createOAuthCallback(
            () => config,
            fetchToken,
          )(request("?code=synthetic"))
        ).status,
      ).toBe(502);
    },
  );
  it("handles network failure without disclosing the thrown error", async () => {
    const fetchToken = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(config.clientSecret));
    const response = await createOAuthCallback(
      () => config,
      fetchToken,
    )(request("?code=synthetic"));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(config.clientSecret);
  });
  it("loads OAuth-only environment without requiring database or webhook configuration", () => {
    vi.stubEnv("LIVECHAT_CLIENT_ID", config.clientId);
    vi.stubEnv("LIVECHAT_CLIENT_SECRET", config.clientSecret);
    vi.stubEnv("LIVECHAT_OAUTH_REDIRECT_URI", config.redirectUri);
    expect(oauthConfig()).toEqual(config);
    vi.stubEnv(
      "LIVECHAT_OAUTH_REDIRECT_URI",
      "http://remote.example.invalid/api/livechat/oauth/callback",
    );
    expect(() => oauthConfig()).toThrow();
  });
});

describe("Temporary safe OAuth diagnostics", () => {
  it.each(["invalid_client", "invalid_grant", "invalid_request"])(
    "shows HTTP status and provider error %s with configuration presence",
    async (providerError) => {
      const fetchToken = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: providerError,
            error_description: "Redirect URI does not match",
            ignored: "NEVER_DISPLAY",
          },
          { status: 400 },
        ),
      );
      const response = await createOAuthCallback(
        () => config,
        fetchToken,
      )(request("?code=diagnostic-code"));
      expect(response.status).toBe(502);
      const html = await response.text();
      expect(html).toContain("HTTP status</dt><dd>400");
      expect(html).toContain(providerError);
      expect(html).toContain("Redirect URI does not match");
      for (const name of [
        "LIVECHAT_CLIENT_ID",
        "LIVECHAT_CLIENT_SECRET",
        "LIVECHAT_OAUTH_REDIRECT_URI",
      ])
        expect(html).toContain(`${name} configurado</dt><dd>sí`);
      expect(html).toContain(config.redirectUri);
      for (const forbidden of [
        config.clientId,
        config.clientSecret,
        "diagnostic-code",
        "NEVER_DISPLAY",
      ])
        expect(html).not.toContain(forbidden);
    },
  );
  it("redacts credentials/code and token fields echoed inside descriptions, including encoded values", async () => {
    const code = "sensitive-code:/+value";
    const description = `${config.clientId} ${config.clientSecret} ${code} ${encodeURIComponent(code)} ${tokens.access_token} ${tokens.refresh_token} access_token=unknown-echo refresh_token=unknown-refresh`;
    const fetchToken = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: "invalid_grant",
          error_description: description,
          ...tokens,
          code,
        },
        { status: 400 },
      ),
    );
    const response = await createOAuthCallback(
      () => config,
      fetchToken,
    )(request("?code=" + encodeURIComponent(code)));
    const html = await response.text();
    expect(html).toContain("invalid_grant");
    expect(html).toContain("[REDACTED]");
    for (const secret of [
      config.clientId,
      config.clientSecret,
      code,
      encodeURIComponent(code),
      tokens.access_token,
      tokens.refresh_token,
      "unknown-echo",
      "unknown-refresh",
    ])
      expect(html).not.toContain(secret);
  });
  it("escapes provider error text and ignores non-string diagnostic fields", async () => {
    const fetchToken = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: { nested: "DO_NOT_RENDER" },
          error_description: '<script>alert("x")</script>',
        },
        { status: 401 },
      ),
    );
    const html = await (
      await createOAuthCallback(
        () => config,
        fetchToken,
      )(request("?code=diagnostic-code"))
    ).text();
    expect(html).toContain("HTTP status</dt><dd>401");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("DO_NOT_RENDER");
  });
  it.each(["<html>UNSAFE_BODY</html>", "{", "x".repeat(65537)])(
    "keeps HTTP status when the error body cannot be safely parsed",
    async (body) => {
      const fetchToken = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body, { status: 500 }));
      const html = await (
        await createOAuthCallback(
          () => config,
          fetchToken,
        )(request("?code=diagnostic-code"))
      ).text();
      expect(html).toContain("HTTP status</dt><dd>500");
      expect(html).not.toContain("UNSAFE_BODY");
      expect(html).not.toContain("x".repeat(1025));
    },
  );
  it("reports absent variables without requesting the provider", async () => {
    vi.stubEnv("LIVECHAT_CLIENT_ID", "");
    vi.stubEnv("LIVECHAT_CLIENT_SECRET", "");
    vi.stubEnv("LIVECHAT_OAUTH_REDIRECT_URI", "");
    const fetchToken = vi.fn<typeof fetch>();
    const html = await (
      await createOAuthCallback(
        oauthConfig,
        fetchToken,
      )(request("?code=diagnostic-code"))
    ).text();
    for (const name of [
      "LIVECHAT_CLIENT_ID",
      "LIVECHAT_CLIENT_SECRET",
      "LIVECHAT_OAUTH_REDIRECT_URI",
    ])
      expect(html).toContain(`${name} configurado</dt><dd>no`);
    expect(fetchToken).not.toHaveBeenCalled();
  });
  it("does not display credentials/query embedded in an invalid redirect URI", async () => {
    vi.stubEnv("LIVECHAT_CLIENT_ID", config.clientId);
    vi.stubEnv("LIVECHAT_CLIENT_SECRET", config.clientSecret);
    vi.stubEnv(
      "LIVECHAT_OAUTH_REDIRECT_URI",
      `https://user:${config.clientSecret}@example.invalid/api/livechat/oauth/callback?code=diagnostic-code`,
    );
    const fetchToken = vi.fn<typeof fetch>();
    const html = await (
      await createOAuthCallback(
        oauthConfig,
        fetchToken,
      )(request("?code=diagnostic-code"))
    ).text();
    expect(html).toContain("redirect_uri efectivo</dt><dd>No disponible");
    expect(html).not.toContain(config.clientSecret);
    expect(html).not.toContain("diagnostic-code");
    expect(fetchToken).not.toHaveBeenCalled();
  });
});
