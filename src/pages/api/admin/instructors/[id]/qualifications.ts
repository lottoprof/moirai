/*
 * POST /api/admin/instructors/{id}/qualifications
 *
 * Body: { module_slugs: string[] }
 *
 * Полностью заменяет qualifications для instructor'а. Idempotent.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../lib/server/guards';
import { setInstructorQualifications } from '../../../../../lib/server/admin-instructors';

export const prerender = false;

const BodySchema = z.object({
  module_slugs: z.array(z.string().min(1)),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const adminOrRes = await requireRoleApi(ctx, 'admin');
  if (adminOrRes instanceof Response) return adminOrRes;
  const admin = adminOrRes;

  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) return jsonError('missing_id', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;

  // Verify target is an instructor
  const target = await env.DB.prepare(
    `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = ? AND ur.role = 'instructor'`,
  ).bind(id).first<{ id: string }>();
  if (!target) return jsonError('not_an_instructor', 404);

  await setInstructorQualifications(env, id, parsed.data.module_slugs, admin.id);

  return new Response(JSON.stringify({ ok: true, count: parsed.data.module_slugs.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
