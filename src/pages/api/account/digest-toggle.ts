/*
 * POST /api/account/digest-toggle
 *
 * Instructor LK v2 Q9 — toggle daily digest email.
 *
 * Body: { enabled: boolean }
 *
 * Apply to user.instructor_digest_opt_in. Поле есть у всех users,
 * но cron шлёт digest только тем у кого role='instructor'.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '../../../lib/server/guards';

export const prerender = false;

const BodySchema = z.object({ enabled: z.boolean() });

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
    `UPDATE users SET instructor_digest_opt_in = ? WHERE id = ?`,
  )
    .bind(parsed.data.enabled ? 1 : 0, user.id)
    .run();

  return new Response(JSON.stringify({ ok: true, enabled: parsed.data.enabled }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
