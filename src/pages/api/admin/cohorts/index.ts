/*
 * POST /api/admin/cohorts — create new cohort + auto-generate sessions.
 *
 * Body: {
 *   programme_id: string,           // 'beginner' | 'intermediate' | etc.
 *   slot_id: string,                // existing slot
 *   start_date: number,             // unix UTC seconds (ET midnight)
 *   modules: string[],              // ordered module slugs (snapshot)
 *   meeting_provider?: 'zoom'|'teams'|'gmeet',
 *   meeting_url?: string,
 *   meeting_host_url?: string,
 * }
 *
 * Backend:
 *   1. Validate slot существует и принадлежит programme_id.
 *   2. INSERT cohort (status='open', lead_instructor_id = slot.instructor_id).
 *   3. Compute session dates через computeSessionDates (DST-aware).
 *   4. Batch INSERT sessions per module (status='scheduled').
 *
 * Response 201: { cohort_id, sessions_count }
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../lib/server/guards';
import {
  computeSessionDates,
  parseDaysJson,
  computeDurationWeeks,
} from '../../../../lib/server/cohorts';

export const prerender = false;

const BodySchema = z.object({
  programme_id: z.string().min(1),
  slot_id: z.string().min(1),
  start_date: z.number().int().positive(),
  modules: z.array(z.string().min(1)).min(1),
  meeting_provider: z.enum(['zoom', 'teams', 'gmeet']).optional(),
  meeting_url: z.string().optional(),
  meeting_host_url: z.string().optional(),
});

function jsonError(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: code, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function uuid(): string { return crypto.randomUUID(); }

export const POST: APIRoute = async (ctx) => {
  const adminOrRes = await requireRoleApi(ctx, 'admin');
  if (adminOrRes instanceof Response) return adminOrRes;

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;

  // Validate slot — exists, matches programme, active
  const slot = await env.DB.prepare(
    `SELECT id, programme_id, days_json, time_et, instructor_id, active
       FROM slots WHERE id = ?`,
  ).bind(parsed.data.slot_id).first<{
    id: string;
    programme_id: string;
    days_json: string;
    time_et: string;
    instructor_id: string | null;
    active: number;
  }>();
  if (!slot) return jsonError('slot_not_found', 404);
  if (slot.active !== 1) return jsonError('slot_inactive', 422);
  if (slot.programme_id !== parsed.data.programme_id) {
    return jsonError('programme_mismatch', 422);
  }

  const days = parseDaysJson(slot.days_json);
  if (days.length === 0) return jsonError('slot_days_invalid', 500);

  // Compute sessions dates
  let sessionDates: number[];
  try {
    sessionDates = computeSessionDates({
      startUnix: parsed.data.start_date,
      count: parsed.data.modules.length,
      days,
      timeEt: slot.time_et,
    });
  } catch (err) {
    console.error('[cohorts POST] computeSessionDates failed:', err);
    return jsonError('compute_sessions_failed', 500);
  }

  // Compute end_date = last session date + 1 day buffer
  const endDate = sessionDates[sessionDates.length - 1] + 86400;
  const cohortId = uuid();
  const now = Math.floor(Date.now() / 1000);

  const ops = [
    env.DB.prepare(
      `INSERT INTO cohorts (
         id, programme_id, slot_id, start_date, end_date, status,
         apply_count, paid_count, lead_instructor_id,
         modules_snapshot_json,
         meeting_provider, meeting_url, meeting_host_url,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'open', 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      cohortId,
      parsed.data.programme_id,
      parsed.data.slot_id,
      parsed.data.start_date,
      endDate,
      slot.instructor_id, // inherit from slot
      JSON.stringify(parsed.data.modules),
      parsed.data.meeting_provider ?? null,
      parsed.data.meeting_url ?? null,
      parsed.data.meeting_host_url ?? null,
      now,
      now,
    ),
  ];

  // Sessions inserts
  const sessionStmt = env.DB.prepare(
    `INSERT INTO sessions (
       id, cohort_id, module_slug, order_idx, scheduled_at, status,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
  );
  for (let i = 0; i < parsed.data.modules.length; i++) {
    ops.push(sessionStmt.bind(
      uuid(),
      cohortId,
      parsed.data.modules[i],
      i,
      sessionDates[i],
      now,
      now,
    ));
  }

  await env.DB.batch(ops);

  return new Response(JSON.stringify({
    cohort_id: cohortId,
    sessions_count: parsed.data.modules.length,
    duration_weeks: computeDurationWeeks(parsed.data.modules.length, days.length),
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
