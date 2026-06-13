/*
 * PATCH /api/instructor/cohorts/[id]/meeting
 *
 * Preподaватель редактирует meeting setup своей cohort'ы
 * (provider + meeting_url + meeting_host_url).
 *
 * ACL: cohort.lead_instructor_id = user.id (instructor роль обязательна).
 * Admin override — отдельный endpoint (нет UI пока).
 *
 * Body (все поля optional, NULL очищает):
 *   {
 *     meeting_provider?: 'zoom'|'teams'|'gmeet' | null,
 *     meeting_url?: string | null,
 *     meeting_host_url?: string | null,
 *   }
 *
 * Response 200: { ok: true }
 * 403: not lead instructor of this cohort
 * 404: cohort not found
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../lib/server/guards';

export const prerender = false;

const BodySchema = z.object({
  meeting_provider: z.enum(['zoom', 'teams', 'gmeet']).nullable().optional(),
  meeting_url: z.string().max(2048).nullable().optional(),
  meeting_host_url: z.string().max(2048).nullable().optional(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const PATCH: APIRoute = async (ctx) => {
  const userOrRes = await requireRoleApi(ctx, 'instructor');
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;
  const env = ctx.locals.runtime.env;

  const cohortId = ctx.params.id;
  if (!cohortId || typeof cohortId !== 'string') return jsonError('invalid_id', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  // ACL: cohort exists + user is lead
  const cohort = await env.DB.prepare(
    `SELECT id, lead_instructor_id FROM cohorts WHERE id = ?`,
  ).bind(cohortId).first<{ id: string; lead_instructor_id: string | null }>();
  if (!cohort) return jsonError('not_found', 404);
  if (cohort.lead_instructor_id !== user.id) return jsonError('forbidden', 403);

  // SET only fields present в body. NULL очищает явно.
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if ('meeting_provider' in parsed.data) {
    sets.push('meeting_provider = ?');
    values.push(parsed.data.meeting_provider ?? null);
  }
  if ('meeting_url' in parsed.data) {
    sets.push('meeting_url = ?');
    values.push(parsed.data.meeting_url ?? null);
  }
  if ('meeting_host_url' in parsed.data) {
    sets.push('meeting_host_url = ?');
    values.push(parsed.data.meeting_host_url ?? null);
  }
  if (sets.length === 0) return jsonError('no_fields', 400);

  sets.push('updated_at = ?');
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE cohorts SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...values, now, cohortId).run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
