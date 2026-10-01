import "server-only";
import { headers } from "next/headers";
import { authorizedLab } from "./lab-auth";
export async function requireLab() {
  if (!authorizedLab((await headers()).get("authorization")))
    throw new Error("Unauthorized");
}
