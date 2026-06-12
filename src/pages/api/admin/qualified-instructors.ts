/*
 * GET /api/admin/qualified-instructors?module=<slug>[&session_id=<id>]
 * GET /api/admin/qualified-instructors?modules=<slug>,<slug>,...
 *
 * Возвращает qualified instructors для запрошенных module slugs.
 *
 * - module=X — qualified для X (substitute use case, requireAll=false)
 * - modules=X,Y,Z — qualified для всех (cohort assignment use case, requireAll=true)
 * - session_id — optional, для check conflict window вокруг конкретной
 *   session (Q2 + Q6 — substitute dropdown получает available=false для
 *   занятых preподов). Без session_id — conflict check не делается.
 */

import type { APIRoute } from 'astro';
import { requireRoleApi } from '../../../lib/server/guards';
import { findQualifiedInstructors } from '../../../lib/server/admin-instructors';

export const prerender = false;

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async (ctx) => {
  const adminOrRes = await requireRoleApi(ctx, 'admin');
  if (adminOrRes instanceof Response) return adminOrRes;

  const single = ctx.url.searchParams.get('module');
  const multi = ctx.url.searchParams.get('modules');
  const sessionId = ctx.url.searchParams.get('session_id');

  let slugs: string[];
  let requireAll: boolean;
  if (single) {
    slugs = [single];
    requireAll = false;
  } else if (multi) {
    slugs = multi.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    requireAll = true;
  } else {
    return jsonError('missing_module', 400);
  }

  const env = ctx.locals.runtime.env;

  // Optional conflict window — если передан session_id, фетчим
  // scheduled_at и передаём в helper (рест-period padding внутри)
  let conflictWindow: { sessionAtSec: number } | undefined;
  if (sessionId) {
    const row = await env.DB.prepare(
      `SELECT scheduled_at FROM sessions WHERE id = ?`,
    ).bind(sessionId).first<{ scheduled_at: number }>();
    if (row) {
      conflictWindow = { sessionAtSec: row.scheduled_at };
    }
  }

  const candidates = await findQualifiedInstructors(env, slugs, {
    requireAllModules: requireAll,
    conflictWindow,
  });

  return new Response(JSON.stringify({ candidates }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
