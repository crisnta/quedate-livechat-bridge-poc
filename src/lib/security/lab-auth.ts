import { secretEqual } from "../livechat/validation";
export function authorizedLab(header: string | null): boolean {
  const user = process.env.WEBHOOK_LAB_USERNAME,
    password = process.env.WEBHOOK_LAB_PASSWORD;
  if (!user || !password || !header || !/^Basic /i.test(header)) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 0) return false;
    const u = secretEqual(decoded.slice(0, i), user),
      p = secretEqual(decoded.slice(i + 1), password);
    return u && p;
  } catch {
    return false;
  }
}
export function labChallenge(): Response {
  return new Response("Autenticación requerida", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Webhook Lab", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
