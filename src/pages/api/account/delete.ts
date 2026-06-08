/*
 * POST /api/account/delete
 *
 * Student LK v2 Stage F/F6 — GDPR delete user account.
 *
 * Body: { confirmation: "DELETE" } (exact match required).
 *
 * Mode:
 *   - 'immediate' — cancel active enrollment + retention immediately
 *   - 'on_completion' (LK_CONFIG default) — set gdpr_delete_requested_at flag,
 *     keep enrollment active. Retention triggers immediately после completion
 *     ИЛИ для уже completed/cancelled enrollments.
 *
 * Personal account data (email, password, OAuth) удаляется НЕМЕДЛЕННО
 * независимо от mode (GDPR Art.17 baseline). User не может login.
 *
 * Returns 200 + Set-Cookie clear → client redirect "/".
 *
 * Spec: docs/student-lk-v2-spec.md § 4.2 + Q10 review.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '../../../lib/server/guards';
import { LK_CONFIG } from '../../../lib/config/lk';
import { checkAccountDeleteBlocked } from '../../../lib/server/admin-instructors';

export const prerender = false;

const BodySchema = z.object({
  confirmation: z.literal('DELETE'),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const userOrRes = await requireAuth(ctx, { allowDeactivated: true });
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('confirmation_required', 400);

  const env = ctx.locals.runtime.env;
  const now = Math.floor(Date.now() / 1000);

  // Admin instructor management S7: блок если user — lead в open/running cohort.
  // GDPR Art.17 allows refusal "for compliance with a legal obligation" + "exercise
  // of public interest" — здесь обязательство перед оплатившими студентами.
  const blockingCohorts = await checkAccountDeleteBlocked(env, user.id);
  if (blockingCohorts.length > 0) {
    return new Response(
      JSON.stringify({ error: 'blocked_active_cohorts', cohorts: blockingCohorts }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Soft-delete user (personal data — immediate per GDPR)
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET deleted_at = ?, email = NULL,
        password_hash = NULL, name = NULL WHERE id = ?`,
    ).bind(now, user.id),
    env.DB.prepare(`DELETE FROM auth_methods WHERE user_id = ?`).bind(user.id),
    env.DB.prepare(
      `UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
    ).bind(now, user.id),
  ]);

  // Apply gdpr_delete_mode logic. Mode из LK_CONFIG — typed as const
  // (cast чтобы eslint не ругался на always-true compare).
  const mode: string = LK_CONFIG.gdpr_delete_mode;
  if (mode === 'on_completion') {
    // Mark flag для on_completion mode. Active enrollments — продолжают.
    // Completed/cancelled — retention triggers immediately.
    await env.DB.prepare(
      `UPDATE enrollments SET gdpr_delete_requested_at = ?
        WHERE user_id = ? AND archived_at IS NULL`,
    )
      .bind(now, user.id)
      .run();
  } else {
    // 'immediate' mode — cancel active + set gdpr flag (retention cron
    // подберёт next pass).
    await env.DB.prepare(
      `UPDATE enrollments
          SET status = 'cancelled',
              cancelled_at = ?,
              gdpr_delete_requested_at = ?
        WHERE user_id = ? AND status = 'active' AND archived_at IS NULL`,
    )
      .bind(now, now, user.id)
      .run();
  }

  // Clear session cookie
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Set-Cookie': 'refresh=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure',
  });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
