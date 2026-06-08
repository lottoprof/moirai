/*
 * POST /api/admin/sessions/{id}/substitute
 *
 * Body: { instructor_id: string | null }
 *
 * Set substitute_instructor_id для session'ы (или снять).
 * Pre-check: instructor должен быть qualified для module_slug session'ы.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../lib/server/guards';
import { setSessionSubstitute, findQualifiedInstructors } from '../../../../../lib/server/admin-instructors';

export const prerender = false;

const BodySchema = z.object({
  instructor_id: z.string().nullable(),
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

  const sessionId = ctx.params.id;
  if (typeof sessionId !== 'string' || sessionId.length === 0) return jsonError('missing_id', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;

  if (parsed.data.instructor_id != null) {
    const session = await env.DB.prepare(
      `SELECT module_slug FROM sessions WHERE id = ?`,
    ).bind(sessionId).first<{ module_slug: string }>();
    if (!session) return jsonError('session_not_found', 404);

    const candidates = await findQualifiedInstructors(env, [session.module_slug], {
      requireAllModules: false,
    });
    const ok = candidates.some((c) => c.user_id === parsed.data.instructor_id);
    if (!ok) return jsonError('not_qualified', 422);
  }

  const updated = await setSessionSubstitute(env, sessionId, parsed.data.instructor_id);
  if (!updated) return jsonError('session_not_found', 404);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
