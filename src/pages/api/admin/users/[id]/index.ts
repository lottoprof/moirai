/*
 * PATCH /api/admin/users/[id] — обновить name / email / locale.
 *
 * Body: { name?, email?, locale? }
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { requireRoleApi } from "../../../../../lib/server/guards";
import { findUserById, findUserByEmail } from "../../../../../lib/server/user-ops";
import { logAuth } from "../../../../../lib/server/audit";

export const prerender = false;

const Schema = z.object({
  name: z.string().max(120).nullable().optional(),
  email: z.string().email().max(254).optional(),
  locale: z.enum(["en", "ru"]).optional(),
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
  const { name, email, locale } = parsed.data;

  // Email change: check unique
  if (email && email.toLowerCase() !== target.email) {
    const other = await findUserByEmail(env, email.toLowerCase());
    if (other && other.id !== userId) return jsonError("email_exists", 409);
  }

  const updates: string[] = [];
  const binds: unknown[] = [];
  if (name !== undefined) {
    updates.push("name = ?");
    binds.push(name);
  }
  if (email !== undefined && email.toLowerCase() !== target.email) {
    // Только при ФАКТИЧЕСКОМ изменении email — сбрасываем verified.
    // Иначе frontend (admin drawer) при каждом Save'е "обнулял" verified
    // даже если email не трогали — pending status у активных user'ов.
    updates.push("email = ?");
    binds.push(email.toLowerCase());
    updates.push("email_verified_at = NULL");
  }
  if (locale !== undefined) {
    updates.push("locale = ?");
    binds.push(locale);
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ ok: true, no_changes: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  updates.push("updated_at = ?");
  binds.push(now);
  binds.push(userId);

  await env.DB.prepare(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
  ).bind(...binds).run();

  await logAuth(env, "user_updated_by_admin", userId, null, ctx.request, {
    by_admin: admin.id,
    fields_changed: { name: name !== undefined, email: email !== undefined, locale: locale !== undefined },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
