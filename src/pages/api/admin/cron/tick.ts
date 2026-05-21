/*
 * POST /api/admin/cron/tick (Stage 14t)
 *
 * Manual / scheduled maintenance tick. Делает 3 status-transition'a:
 *   1. applications awaiting_payment + cohort.start_date <= now → expired
 *   2. cohorts open + start_date <= now → running
 *   3. cohorts running + end_date <= now → completed
 *
 * Idempotent: повторный вызов — no-op если ничего не подошло под условия.
 *
 * Sprint 1: вручную через POST (admin auth).
 * Sprint 2: добавим CF Cron Trigger который дёргает endpoint раз в день
 *   через секретный токен (env.CRON_SECRET) вместо admin session.
 *
 * Notifications (FLOW-23) deferred to Sprint 2 — пока только status changes
 * без email клиенту про expired application.
 */

import type { APIRoute } from "astro";
import { requireRoleApi } from "../../../../lib/server/guards";
import { expireOverdueApplications } from "../../../../lib/server/applications";
import { logAuth } from "../../../../lib/server/audit";

export const prerender = false;

function jsonOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (ctx) => {
  const adminOrRes = await requireRoleApi(ctx, "admin");
  if (adminOrRes instanceof Response) return adminOrRes;
  const admin = adminOrRes;

  const env = ctx.locals.runtime.env;
  const now = Math.floor(Date.now() / 1000);

  // 1. Expire overdue applications (helper уже idempotent)
  const expiredCount = await expireOverdueApplications(env);

  // 2. Cohort transitions — open → running
  const toRunning = await env.DB.prepare(
    `UPDATE cohorts SET status = 'running' WHERE status = 'open' AND start_date <= ?`,
  ).bind(now).run();
  const runningCount = toRunning.meta.changes;

  // 3. Cohort transitions — running → completed
  const toCompleted = await env.DB.prepare(
    `UPDATE cohorts SET status = 'completed' WHERE status = 'running' AND end_date <= ?`,
  ).bind(now).run();
  const completedCount = toCompleted.meta.changes;

  // Audit summary
  await logAuth(env, "application_status_changed", admin.id, "password", ctx.request, {
    via: "admin_cron_tick",
    expired_applications: expiredCount,
    cohorts_to_running: runningCount,
    cohorts_to_completed: completedCount,
    by_admin_id: admin.id,
    timestamp: now,
  });

  return jsonOk({
    expired_applications: expiredCount,
    cohorts_to_running: runningCount,
    cohorts_to_completed: completedCount,
  });
};
