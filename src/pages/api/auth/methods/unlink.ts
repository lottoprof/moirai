/*
 * POST /api/auth/methods/unlink
 *
 * Удалить auth method (password / google / discord) у залогиненного
 * user'а. Invariant: после удаления должен остаться **≥1 method**,
 * иначе user не сможет залогиниться обратно.
 *
 * Body:  { kind: "password" | "google" | "discord" }
 * Resp:
 *   200 { ok: true }
 *   400 { error: "invalid_input" | "method_not_found" | "cannot_unlink_last_method" }
 *   401 { error: "unauthenticated" }
 *
 * Не revoke'ит сессии — текущая сессия остаётся валидной (user
 * залогинен через другой method).
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import {
  findUserById,
  findAuthMethod,
  getUserAuthMethods,
  unlinkAuthMethod,
} from "../../../../lib/server/user-ops";
import { verifyRefreshSession } from "../../../../lib/server/session";
import { logAuth } from "../../../../lib/server/audit";

export const prerender = false;

const Schema = z.object({
  kind: z.enum(["password", "google", "discord"]),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  const session = await verifyRefreshSession(env, request);
  if (!session) return jsonError("unauthenticated", 401);

  const user = await findUserById(env, session.userId);
  if (!user) return jsonError("unauthenticated", 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { kind } = parsed.data;

  const method = await findAuthMethod(env, user.id, kind);
  if (!method) return jsonError("method_not_found", 400);

  // Invariant: ≥1 method должен остаться
  const all = await getUserAuthMethods(env, user.id);
  if (all.length <= 1) {
    return jsonError("cannot_unlink_last_method", 400);
  }

  await unlinkAuthMethod(env, method.id);

  await logAuth(env, "method_unlink", user.id, kind, request, {
    method_id: method.id,
    methods_remaining: all.length - 1,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
