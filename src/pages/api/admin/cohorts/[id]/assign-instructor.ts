/*
 * POST /api/admin/cohorts/{id}/assign-instructor
 *
 * Body: { instructor_id: string | null }
 *
 * Назначает (или снимает) lead_instructor_id cohort'ы.
 * Pre-check: instructor должен быть qualified для всех модулей cohort'ы.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../lib/server/guards';
import { assignCohortLead, findQualifiedInstructors } from '../../../../../lib/server/admin-instructors';

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

  const cohortId = ctx.params.id;
  if (typeof cohortId !== 'string' || cohortId.length === 0) return jsonError('missing_id', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;

  // Validate cohort exists + qualification check для non-null assignment
  if (parsed.data.instructor_id != null) {
    const cohort = await env.DB.prepare(
      `SELECT modules_snapshot_json FROM cohorts WHERE id = ?`,
    ).bind(cohortId).first<{ modules_snapshot_json: string }>();
    if (!cohort) return jsonError('cohort_not_found', 404);

    let moduleSlugs: string[];
    try { moduleSlugs = JSON.parse(cohort.modules_snapshot_json) as string[]; }
    catch { moduleSlugs = []; }

    const candidates = await findQualifiedInstructors(env, moduleSlugs, { requireAllModules: true });
    const ok = candidates.some((c) => c.user_id === parsed.data.instructor_id);
    if (!ok) return jsonError('not_qualified', 422);
  }

  const updated = await assignCohortLead(env, cohortId, parsed.data.instructor_id);
  if (!updated) return jsonError('cohort_not_found', 404);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
