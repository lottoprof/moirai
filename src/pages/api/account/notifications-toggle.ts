/*
 * POST /api/account/notifications-toggle
 *
 * Student LK v2 Stage F/F7 — toggle email notifications для feedback.
 *
 * Body: { enabled: boolean }
 *
 * Spec: docs/student-lk-v2-spec.md § 4.2 + Q2f review.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '../../../lib/server/guards';

export const prerender = false;

const BodySchema = z.object({
  enabled: z.boolean(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const userOrRes = await requireAuth(ctx);
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;
  await env.DB.prepare(
    `UPDATE users SET notifications_email = ? WHERE id = ?`,
  )
    .bind(parsed.data.enabled ? 1 : 0, user.id)
    .run();

  return new Response(JSON.stringify({ ok: true, enabled: parsed.data.enabled }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
