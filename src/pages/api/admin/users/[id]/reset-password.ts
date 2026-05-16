/*
 * POST /api/admin/users/[id]/reset-password
 *
 * Admin re-issues password-reset token + emails user.
 * Reuse существующей verify-tokens + Resend infrastructure.
 */

import type { APIRoute } from "astro";
import { requireRoleApi } from "../../../../../lib/server/guards";
import { findUserById } from "../../../../../lib/server/user-ops";
import { createVerifyToken, TTL_PASSWORD_RESET } from "../../../../../lib/server/verify-tokens";
import { sendEmail } from "../../../../../lib/server/email";
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

  const token = await createVerifyToken(env, {
    kind: "password_reset",
    userId: target.id,
    email: target.email,
    locale: target.locale,
  }, TTL_PASSWORD_RESET);

  const url = `${ctx.url.origin}/${target.locale}/password-reset?token=${token}`;
  await sendEmail(env, {
    to: target.email,
    locale: target.locale,
    kind: "password_reset",
    actionUrl: url,
    recipientName: target.name ?? null,
  });

  await logAuth(env, "password_reset", target.id, null, ctx.request, {
    via: "admin_trigger",
    by_admin: admin.id,
  });

  return new Response(JSON.stringify({ ok: true, reset_url: url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
