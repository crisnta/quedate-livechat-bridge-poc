import { NextRequest, NextResponse } from "next/server";
import { authorizedLab, labChallenge } from "./lib/security/lab-auth";
export function proxy(request: NextRequest) {
  if (!authorizedLab(request.headers.get("authorization")))
    return labChallenge();
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export const config = { matcher: ["/webhook-lab/:path*"] };
