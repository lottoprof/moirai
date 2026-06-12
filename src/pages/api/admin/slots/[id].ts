/*
 * PATCH /api/admin/slots/{id} — update slot fields.
 *
 * Q3 (decisions_archive 2026-06-11) = A: hard block если новые
 * (instructor_id, days, time_et) создают structural overlap с другими
 * slots того же instructor'а.
 *
 * Body: partial — { days?, time_et?, instructor_id?, max_students?, active? }
 * programme_id immutable (нельзя поменять — cohorts уже ссылаются).
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../lib/server/guards';
import { findInstructorSlotConflicts } from '../../../../lib/server/admin-instructors';

export const prerender = false;

const DayCode = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const TimeEt = z.string().regex(/^\d{2}:\d{2}$/);

const BodySchema = z.object({
  days: z.array(DayCode).min(1).optional(),
  time_et: TimeEt.optional(),
  instructor_id: z.string().nullable().optional(),
  max_students: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

function jsonError(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: code, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const PATCH: APIRoute = async (ctx) => {
  const adminOrRes = await requireRoleApi(ctx, 'admin');
  if (adminOrRes instanceof Response) return adminOrRes;

  const slotId = ctx.params.id;
  if (typeof slotId !== 'string' || slotId.length === 0) return jsonError('missing_id', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;

  // Fetch current slot для расчёта effective полей при partial update
  const current = await env.DB.prepare(
    `SELECT instructor_id, days_json, time_et FROM slots WHERE id = ?`,
  ).bind(slotId).first<{ instructor_id: string | null; days_json: string; time_et: string }>();
  if (!current) return jsonError('not_found', 404);

  const effectiveInstructorId = parsed.data.instructor_id !== undefined
    ? parsed.data.instructor_id
    : current.instructor_id;
  let effectiveDays: string[];
  if (parsed.data.days) {
    effectiveDays = parsed.data.days;
  } else {
    try { effectiveDays = JSON.parse(current.days_json) as string[]; }
    catch { effectiveDays = []; }
  }
  const effectiveTimeEt = parsed.data.time_et ?? current.time_et;

  // Q3 hard block — проверяем conflict если меняется instructor/days/time
  const scheduleChanged = parsed.data.days || parsed.data.time_et
    || parsed.data.instructor_id !== undefined;
  if (effectiveInstructorId && scheduleChanged) {
    const conflicts = await findInstructorSlotConflicts(
      env, effectiveInstructorId, effectiveDays, effectiveTimeEt, slotId,
    );
    if (conflicts.length > 0) {
      return jsonError('slot_conflict', 409, { conflicts });
    }
  }

  // Build dynamic UPDATE
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (parsed.data.days) {
    sets.push('days_json = ?');
    binds.push(JSON.stringify(parsed.data.days));
  }
  if (parsed.data.time_et) { sets.push('time_et = ?'); binds.push(parsed.data.time_et); }
  if (parsed.data.instructor_id !== undefined) {
    sets.push('instructor_id = ?');
    binds.push(parsed.data.instructor_id);
  }
  if (parsed.data.max_students !== undefined) {
    sets.push('max_students = ?');
    binds.push(parsed.data.max_students);
  }
  if (parsed.data.active !== undefined) {
    sets.push('active = ?');
    binds.push(parsed.data.active ? 1 : 0);
  }
  sets.push('updated_at = unixepoch()');

  if (sets.length === 1) return new Response(JSON.stringify({ ok: true, noop: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });

  await env.DB.prepare(
    `UPDATE slots SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds, slotId).run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
