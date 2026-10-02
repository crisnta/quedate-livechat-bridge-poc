import "server-only";
import { requireLab } from "../security/require-lab";
import { database } from "../db/client";
import { createOperationsReader } from "./repository";
export function operations() {
  const org = process.env.LIVECHAT_ORGANIZATION_ID;
  if (!org) throw new Error("Organization not configured");
  return createOperationsReader(async (sql, params) => {
    await requireLab();
    return database().query(sql, params);
  }, org);
}
