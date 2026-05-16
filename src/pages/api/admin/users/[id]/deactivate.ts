/*
 * POST /api/admin/users/[id]/deactivate
 *
 * Sets users.deactivated_at = NOW. User может login'иться, но
 * redirect на /[locale]/inactive (см. guards/auth-redirect).
 *
 * Last-admin invariant: запрет deactivate последнего active admin'а
 * (DB trigger ловит только DELETE из user_roles; для users.deactivated_at
 * проверка в коде).
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
  if (target.deactivated_at !== null) {
    return jsonError("already_deactivated", 409);
  }

  // Last-admin invariant: считаем других active admin'ов
  const rolesRow = await env.DB.prepare(
    `SELECT role FROM user_roles WHERE user_id = ?`,
  ).bind(userId).all<{ role: string }>();
  const hasAdminRole = rolesRow.results.some((r) => r.role === "admin");

  if (hasAdminRole) {
    const others = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       WHERE ur.role = 'admin' AND u.deactivated_at IS NULL AND u.id != ?`,
    ).bind(userId).first<{ cnt: number }>();
    if ((others?.cnt ?? 0) === 0) {
      return jsonError("cannot_deactivate_last_admin", 409);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  // Атомарно: deactivate + revoke все active sessions
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET deactivated_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(now, now, userId),
    env.DB.prepare(
      `UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
    ).bind(now, userId),
  ]);

  await logAuth(env, "user_deactivated", userId, null, ctx.request, {
    by_admin: admin.id,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
