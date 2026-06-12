/*
 * POST /api/admin/cohorts/{id}/public-display
 *
 * Update public_priority + public_label fields (Q8, migration 0019).
 *
 * Body: { public_priority: number | null, public_label: string | null }
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../lib/server/guards';

export const prerender = false;

const BodySchema = z.object({
  public_priority: z.number().int().nullable(),
  public_label: z.string().max(40).nullable(),
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

  const cohortId = ctx.params.id;
  if (typeof cohortId !== 'string' || cohortId.length === 0) return jsonError('missing_id', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;
  const result = await env.DB.prepare(
    `UPDATE cohorts
        SET public_priority = ?, public_label = ?,
            updated_at = unixepoch()
      WHERE id = ?`,
  ).bind(parsed.data.public_priority, parsed.data.public_label, cohortId).run();

  if (result.meta.changes === 0) return jsonError('cohort_not_found', 404);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
