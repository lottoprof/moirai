/*
 * PATCH /api/admin/users/[id]/roles
 *
 * Body: { roles: ('student'|'instructor'|'admin')[] }
 *
 * Sync user_roles: добавляет missing, удаляет dropped.
 * Last-admin invariant защищён DB-trigger'ом — INSERT/DELETE
 * атомарны в batch'и; rollback при ABORT.
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { requireRoleApi } from "../../../../../lib/server/guards";
import { findUserById } from "../../../../../lib/server/user-ops";
import { logAuth } from "../../../../../lib/server/audit";

export const prerender = false;

const Schema = z.object({
  roles: z.array(z.enum(["student", "instructor", "admin"])).min(1),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async (ctx) => {
  const guard = await requireRoleApi(ctx, "admin");
  if (guard instanceof Response) return guard;
  const admin = guard;
  const env = ctx.locals.runtime.env;

  const userId = ctx.params.id;
  if (!userId) return jsonError("invalid_input", 400);

  const target = await findUserById(env, userId);
  if (!target) return jsonError("not_found", 404);

  let raw: unknown;
  try { raw = await ctx.request.json(); }
  catch { return jsonError("invalid_json", 400); }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { roles: desired } = parsed.data;

  // Текущие роли
  type Role = "student" | "instructor" | "admin";
  const currentRows = await env.DB.prepare(
    `SELECT role FROM user_roles WHERE user_id = ?`,
  ).bind(userId).all<{ role: Role }>();
  const current = new Set<Role>(currentRows.results.map((r) => r.role));
  const desiredSet = new Set<Role>(desired);

  const toAdd: Role[] = [...desiredSet].filter((r) => !current.has(r));
  const toRemove: Role[] = [...current].filter((r) => !desiredSet.has(r));

  if (toAdd.length === 0 && toRemove.length === 0) {
    return new Response(JSON.stringify({ ok: true, no_changes: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const statements = [
    ...toAdd.map((r) =>
      env.DB.prepare(
        `INSERT INTO user_roles (user_id, role, granted_by, granted_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(userId, r, admin.id, now),
    ),
    ...toRemove.map((r) =>
      env.DB.prepare(
        `DELETE FROM user_roles WHERE user_id = ? AND role = ?`,
      ).bind(userId, r),
    ),
    env.DB.prepare(
      `UPDATE users SET updated_at = ? WHERE id = ?`,
    ).bind(now, userId),
  ];

  try {
    await env.DB.batch(statements);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Triggers: prevent_role_orphan, prevent_last_admin_demotion
    if (msg.includes("user must have at least one role")) {
      return jsonError("cannot_remove_last_role", 409);
    }
    if (msg.includes("at least one active admin")) {
      return jsonError("cannot_remove_last_admin", 409);
    }
    console.error("[admin/users/roles] batch failed:", err);
    return jsonError("internal_error", 500);
  }

  // Audit per role-change
  for (const r of toAdd) {
    await logAuth(env, "role_granted", userId, null, ctx.request, {
      by_admin: admin.id,
      role: r,
    });
  }
  for (const r of toRemove) {
    await logAuth(env, "role_revoked", userId, null, ctx.request, {
      by_admin: admin.id,
      role: r,
    });
  }

  return new Response(JSON.stringify({ ok: true, added: toAdd, removed: toRemove }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
