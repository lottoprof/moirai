/*
 * POST /api/student/homework/last-seen
 *
 * Student LK v2 Stage C/C3e — обновить enrollments.homework_last_seen_at
 * для всех active enrollments user'а.
 *
 * Используется при заходе на /dashboard/homework — снимает unread badge.
 *
 * Spec: docs/student-lk-v2-spec.md § 4.2.
 */

import type { APIRoute } from 'astro';
import { requireRoleApi } from '../../../../lib/server/guards';
import { updateHomeworkLastSeen } from '../../../../lib/server/homework';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const userOrRes = await requireRoleApi(ctx, 'student');
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  const env = ctx.locals.runtime.env;
  await updateHomeworkLastSeen(env, user.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
