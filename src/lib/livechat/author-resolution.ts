import type { AuthorType } from "../events/types";
export function resolveAuthor(
  id: string | null,
  users: Record<string, AuthorType>,
): AuthorType {
  return id && Object.hasOwn(users, id) ? users[id] : "unknown";
}
