/*
 * POST /api/admin/sessions/{id}/reschedule
 *
 * Q5 (decisions_archive 2026-06-11): soft warn для конфликтов с
 * lead / substitute / students. Sprint 1 — admin видит conflicts в
 * response, через `?confirm=1` подтверждает submit.
 *
 * Body: { scheduled_at: number }
 * Query: ?confirm=1 (optional) — пропускает conflict check
 *
 * Response 200:
 *   { ok: true } — no conflicts OR confirm=1
 *   { needs_confirm: true, conflicts: [...] } — есть conflicts без confirm
 *
 * Conflict types:
 *   - 'lead' — cohort.lead_instructor_id занят на новой дате
 *   - 'substitute' — substitute_instructor_id занят на новой дате
 *   - 'student' — student bundle bound в другой cohort с overlap
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../lib/server/guards';
import { LK_CONFIG } from '../../../../../lib/config/lk';

export const prerender = false;

const BodySchema = z.object({
  scheduled_at: z.number().int().positive(),
});

interface RescheduleConflict {
  kind: 'lead' | 'substitute' | 'student';
  user_id: string;
  user_name: string | null;
  conflicting_session_id: string;
  conflicting_scheduled_at: number;
}

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

  const confirm = ctx.url.searchParams.get('confirm') === '1';

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;
  const newAt = parsed.data.scheduled_at;

  // Fetch session + cohort meta для conflict detection
  const session = await env.DB.prepare(
    `SELECT s.id, s.cohort_id, s.module_slug, s.scheduled_at,
            c.lead_instructor_id, s.substitute_instructor_id
       FROM sessions s
       JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.id = ?`,
  ).bind(sessionId).first<{
    id: string;
    cohort_id: string;
    module_slug: string;
    scheduled_at: number;
    lead_instructor_id: string | null;
    substitute_instructor_id: string | null;
  }>();
  if (!session) return jsonError('session_not_found', 404);

  const conflicts: RescheduleConflict[] = [];
  if (!confirm) {
    // Window с rest padding (Q6 rule)
    const restSec = LK_CONFIG.min_instructor_rest_min * 60;
    const durSec = LK_CONFIG.default_session_duration_min * 60;
    const fromSec = newAt - restSec;
    const toSec = newAt + durSec + restSec;

    // Effective instructor для проверки = substitute если есть, иначе lead
    const effectiveUserId = session.substitute_instructor_id ?? session.lead_instructor_id;

    if (effectiveUserId) {
      // Check other sessions в окне где effective user занят
      const otherSessions = await env.DB.prepare(
        `SELECT s.id, s.scheduled_at, s.cohort_id,
                COALESCE(s.substitute_instructor_id, c.lead_instructor_id) AS effective_user_id,
                u.name AS user_name
           FROM sessions s
           JOIN cohorts c ON c.id = s.cohort_id
           LEFT JOIN users u ON u.id = COALESCE(s.substitute_instructor_id, c.lead_instructor_id)
          WHERE s.status = 'scheduled'
            AND s.id != ?
            AND s.scheduled_at BETWEEN ? AND ?
            AND COALESCE(s.substitute_instructor_id, c.lead_instructor_id) = ?`,
      ).bind(sessionId, fromSec, toSec, effectiveUserId).all<{
        id: string;
        scheduled_at: number;
        cohort_id: string;
        effective_user_id: string;
        user_name: string | null;
      }>();
      for (const o of otherSessions.results) {
        const kind: 'lead' | 'substitute' = session.substitute_instructor_id ? 'substitute' : 'lead';
        conflicts.push({
          kind,
          user_id: o.effective_user_id,
          user_name: o.user_name,
          conflicting_session_id: o.id,
          conflicting_scheduled_at: o.scheduled_at,
        });
      }
    }

    // Student conflicts — check enrollments of cohort vs other cohorts of same students
    const studentConflicts = await env.DB.prepare(
      `SELECT u.id AS user_id, u.name AS user_name,
              s2.id AS conflicting_session_id, s2.scheduled_at AS conflicting_scheduled_at
         FROM applications a1
         JOIN enrollments e1 ON e1.id = a1.enrollment_id
         JOIN users u ON u.id = e1.user_id
         JOIN applications a2 ON a2.user_id = u.id AND a2.cohort_id != a1.cohort_id
         JOIN enrollments e2 ON e2.id = a2.enrollment_id AND e2.archived_at IS NULL
         JOIN sessions s2 ON s2.cohort_id = a2.cohort_id
        WHERE a1.cohort_id = ?
          AND e1.archived_at IS NULL
          AND s2.status = 'scheduled'
          AND s2.scheduled_at BETWEEN ? AND ?
        GROUP BY u.id, s2.id`,
    ).bind(session.cohort_id, fromSec, toSec).all<{
      user_id: string;
      user_name: string | null;
      conflicting_session_id: string;
      conflicting_scheduled_at: number;
    }>();
    for (const sc of studentConflicts.results) {
      conflicts.push({
        kind: 'student',
        user_id: sc.user_id,
        user_name: sc.user_name,
        conflicting_session_id: sc.conflicting_session_id,
        conflicting_scheduled_at: sc.conflicting_scheduled_at,
      });
    }

    if (conflicts.length > 0) {
      return new Response(
        JSON.stringify({ needs_confirm: true, conflicts }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // Apply reschedule
  await env.DB.prepare(
    `UPDATE sessions
        SET scheduled_at = ?,
            status = 'rescheduled',
            updated_at = unixepoch()
      WHERE id = ?`,
  ).bind(newAt, sessionId).run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
