/*
 * POST /api/admin/users/[id]/anonymize — irreversible.
 *
 * Действия:
 *   email → 'deleted-{uuid}@example.invalid'
 *   name → NULL
 *   email_verified_at → NULL
 *   referral_code → 'DELETED-{uuid8}'
 *   DELETE auth_methods (user не сможет login'нуться)
 *   DELETE auth_sessions
 *   user_roles остаются (для audit trail)
 *   enrollments остаются (для финансовой отчётности)
 *   audit_log остаётся (forensic trail)
 *
 * Last-admin invariant: запрет anonymize последнего active admin'а.
 */

import type { APIRoute } from "astro";
import { requireRoleApi } from "../../../../../lib/server/guards";
import { findUserById } from "../../../../../lib/server/user-ops";
import { logAuth } from "../../../../../lib/server/audit";
import { checkAccountDeleteBlocked } from "../../../../../lib/server/admin-instructors";

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

  // Запрет self-anonymize — admin не должен случайно прибить себя
  if (userId === admin.id) return jsonError("cannot_anonymize_self", 409);

  // Block если user — lead в open/running cohort (S7 admin-instructor-management)
  const blockingCohorts = await checkAccountDeleteBlocked(env, userId);
  if (blockingCohorts.length > 0) {
    return new Response(
      JSON.stringify({ error: "blocked_active_cohorts", cohorts: blockingCohorts }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // Last-admin invariant
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
      return jsonError("cannot_anonymize_last_admin", 409);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const anonId = crypto.randomUUID();
  const fakeEmail = `deleted-${anonId}@example.invalid`;
  const fakeReferral = `DELETED-${anonId.slice(0, 8).toUpperCase()}`;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET
         email = ?, name = NULL, email_verified_at = NULL,
         referral_code = ?, deactivated_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(fakeEmail, fakeReferral, now, now, userId),
    env.DB.prepare(`DELETE FROM auth_methods WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ?`).bind(userId),
  ]);

  await logAuth(env, "user_anonymized", userId, null, ctx.request, {
    by_admin: admin.id,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
