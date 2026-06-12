/*
 * POST /api/admin/slots — create new slot.
 *
 * Q3 (decisions_archive 2026-06-11) = A: hard block если у того же
 * instructor'а есть structural overlap (day × time_et). Validation
 * через findInstructorSlotConflicts перед INSERT.
 *
 * Body: {
 *   programme_id, days: string[], time_et: 'HH:MM',
 *   instructor_id?: string | null, max_students: number, active?: boolean
 * }
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../lib/server/guards';
import { findInstructorSlotConflicts } from '../../../../lib/server/admin-instructors';

export const prerender = false;

const DayCode = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const TimeEt = z.string().regex(/^\d{2}:\d{2}$/);

const BodySchema = z.object({
  programme_id: z.string().min(1),
  days: z.array(DayCode).min(1),
  time_et: TimeEt,
  instructor_id: z.string().nullable().optional(),
  max_students: z.number().int().positive(),
  active: z.boolean().optional(),
});

function jsonError(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: code, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function uuid(): string {
  return crypto.randomUUID();
}

export const POST: APIRoute = async (ctx) => {
  const adminOrRes = await requireRoleApi(ctx, 'admin');
  if (adminOrRes instanceof Response) return adminOrRes;

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;
  const now = Math.floor(Date.now() / 1000);
  const slotId = uuid();
  const instructorId = parsed.data.instructor_id ?? null;

  // Q3 hard block: проверяем structural overlap для того же instructor'а
  if (instructorId) {
    const conflicts = await findInstructorSlotConflicts(
      env, instructorId, parsed.data.days, parsed.data.time_et,
    );
    if (conflicts.length > 0) {
      return jsonError('slot_conflict', 409, { conflicts });
    }
  }

  await env.DB.prepare(
    `INSERT INTO slots (id, programme_id, days_json, time_et, instructor_id,
                        max_students, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    slotId,
    parsed.data.programme_id,
    JSON.stringify(parsed.data.days),
    parsed.data.time_et,
    instructorId,
    parsed.data.max_students,
    parsed.data.active === false ? 0 : 1,
    now,
    now,
  ).run();

  return new Response(JSON.stringify({ ok: true, id: slotId }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
