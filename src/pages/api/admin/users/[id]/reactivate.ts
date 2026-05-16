/*
 * POST /api/admin/users/[id]/reactivate
 *
 * users.deactivated_at = NULL. Не воссоздаёт revoked sessions —
 * user'у придётся login'нуться заново.
 */

import type { APIRoute } from "astro";
import { requireRoleApi } from "../../../../../lib/server/guards";
import { findUserById } from "../../../../../lib/server/user-ops";
import { logAuth } from "../../../../../lib/server/audit";

export const prerender = false;

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (ctx) => {
  const guard = await requireRoleApi(ctx, "admin");
  if (guard instanceof Response) return guard;
  const admin = guard;
  const env = ctx.locals.runtime.env;

  const userId = ctx.params.id;
  if (!userId) return jsonError("invalid_input", 400);

  const target = await findUserById(env, userId);
  if (!target) return jsonError("not_found", 404);
  if (target.deactivated_at === null) {
    return jsonError("not_deactivated", 409);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE users SET deactivated_at = NULL, updated_at = ? WHERE id = ?`,
  ).bind(now, userId).run();

  await logAuth(env, "user_reactivated", userId, null, ctx.request, {
    by_admin: admin.id,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
