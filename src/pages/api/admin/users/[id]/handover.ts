/*
 * POST /api/admin/users/{id}/handover
 *
 * Body: { assignments: [{ cohort_id, instructor_id }, ...] }
 *
 * Batch reassign cohort leads. Каждый assignment проверяется на
 * qualification для всех модулей соответствующей cohort'ы.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../lib/server/guards';
import { assignCohortLead, findQualifiedInstructors } from '../../../../../lib/server/admin-instructors';

export const prerender = false;

const BodySchema = z.object({
  assignments: z.array(z.object({
    cohort_id: z.string().min(1),
    instructor_id: z.string().min(1),
  })),
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

  const targetUserId = ctx.params.id;
  if (typeof targetUserId !== 'string' || targetUserId.length === 0) {
    return jsonError('missing_id', 400);
  }

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;
  const results: { cohort_id: string; ok: boolean; reason?: string }[] = [];

  for (const a of parsed.data.assignments) {
    // Validate cohort + лead == targetUserId
    const cohort = await env.DB.prepare(
      `SELECT lead_instructor_id, modules_snapshot_json FROM cohorts WHERE id = ?`,
    ).bind(a.cohort_id).first<{ lead_instructor_id: string | null; modules_snapshot_json: string }>();
    if (!cohort) {
      results.push({ cohort_id: a.cohort_id, ok: false, reason: 'cohort_not_found' });
      continue;
    }
    if (cohort.lead_instructor_id !== targetUserId) {
      results.push({ cohort_id: a.cohort_id, ok: false, reason: 'not_target_lead' });
      continue;
    }

    let moduleSlugs: string[];
    try { moduleSlugs = JSON.parse(cohort.modules_snapshot_json) as string[]; }
    catch { moduleSlugs = []; }

    const candidates = await findQualifiedInstructors(env, moduleSlugs, { requireAllModules: true });
    if (!candidates.some((c) => c.user_id === a.instructor_id)) {
      results.push({ cohort_id: a.cohort_id, ok: false, reason: 'not_qualified' });
      continue;
    }

    const updated = await assignCohortLead(env, a.cohort_id, a.instructor_id);
    results.push({ cohort_id: a.cohort_id, ok: updated });
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
