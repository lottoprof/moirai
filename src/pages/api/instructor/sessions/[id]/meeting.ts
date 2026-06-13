/*
 * PATCH /api/instructor/sessions/[id]/meeting
 *
 * Per-session override meeting URL. Использование: substitute preподи
 * со своим Zoom для одной конкретной сессии, или мерч-классу нужна
 * другая комната.
 *
 * Resolution chain в UI:
 *   session.meeting_url ?? cohort.meeting_url ?? null
 *
 * ACL: user lead_instructor cohort'ы ИЛИ substitute этой session'и.
 * Запрет: instructor не lead/sub этой session'и → 403.
 *
 * Body (все поля optional, NULL очищает override):
 *   {
 *     meeting_url?: string | null,
 *     meeting_host_url?: string | null,
 *   }
 *
 * Note: session-level НЕТ meeting_provider (наследуем от cohort.provider).
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../lib/server/guards';

export const prerender = false;

const BodySchema = z.object({
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

  const sessionId = ctx.params.id;
  if (!sessionId || typeof sessionId !== 'string') return jsonError('invalid_id', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  // ACL: user — lead cohort'ы ИЛИ substitute этой сессии
  const row = await env.DB.prepare(
    `SELECT s.id, s.substitute_instructor_id, c.lead_instructor_id
       FROM sessions s
       JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.id = ?`,
  ).bind(sessionId).first<{
    id: string;
    substitute_instructor_id: string | null;
    lead_instructor_id: string | null;
  }>();
  if (!row) return jsonError('not_found', 404);
  const isOwn = row.lead_instructor_id === user.id || row.substitute_instructor_id === user.id;
  if (!isOwn) return jsonError('forbidden', 403);

  const sets: string[] = [];
  const values: (string | null)[] = [];
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
    `UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...values, now, sessionId).run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
