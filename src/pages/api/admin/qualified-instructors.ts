/*
 * GET /api/admin/qualified-instructors?module=<slug>
 * GET /api/admin/qualified-instructors?modules=<slug>,<slug>,...
 *
 * Возвращает qualified instructors для запрошенных module slugs.
 *
 * - module=X — qualified для X (substitute use case, requireAll=false)
 * - modules=X,Y,Z — qualified для всех (cohort assignment use case, requireAll=true)
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
  const candidates = await findQualifiedInstructors(env, slugs, { requireAllModules: requireAll });

  return new Response(JSON.stringify({ candidates }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
