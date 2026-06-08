/*
 * POST /api/internal/cron/run?job=<name>
 *
 * Student LK v2 Stage F cron endpoint.
 *
 * Triggered:
 *   - External scheduler (CF Cron Triggers через wrangler.toml [triggers]
 *     или separate worker hitting this URL)
 *   - Admin manual через UI (для testing)
 *
 * Auth: Bearer <CRON_SECRET>.
 *
 * Jobs:
 *   - auto-approve        (recommended every 15 min)
 *   - retention           (daily ~03:00 UTC)
 *   - pre-archive-email   (daily ~04:00 UTC)
 *   - orphan-cleanup      (daily ~05:00 UTC)
 *   - instructor-digest   (daily ~13:00 UTC ≈ 09:00 EDT)
 *
 * Spec: docs/student-lk-v2-spec.md § 6.
 */

import type { APIRoute } from 'astro';
import { runAutoApprove } from '../../../../lib/server/cron/auto-approve';
import { runRetention } from '../../../../lib/server/cron/retention';
import { runPreArchiveEmail } from '../../../../lib/server/cron/pre-archive-email';
import { runOrphanCleanup } from '../../../../lib/server/cron/orphan-cleanup';
import { runInstructorDigest } from '../../../../lib/server/cron/instructor-digest';

export const prerender = false;

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const env = ctx.locals.runtime.env;

  const auth = ctx.request.headers.get('Authorization');
  if (!env.CRON_SECRET || !auth || auth !== `Bearer ${env.CRON_SECRET}`) {
    return jsonError('unauthorized', 401);
  }

  const job = ctx.url.searchParams.get('job');
  if (!job) return jsonError('missing_job', 400);

  let result: unknown;
  const startedAt = new Date().toISOString();

  try {
    switch (job) {
      case 'auto-approve':       result = await runAutoApprove(env); break;
      case 'retention':          result = await runRetention(env); break;
      case 'pre-archive-email':  result = await runPreArchiveEmail(env); break;
      case 'orphan-cleanup':     result = await runOrphanCleanup(env); break;
      case 'instructor-digest':  result = await runInstructorDigest(env); break;
      default: return jsonError('unknown_job', 400);
    }
  } catch (err) {
    console.error('[cron] job failed:', job, err);
    return new Response(
      JSON.stringify({ job, error: String(err), startedAt }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const summary = { job, startedAt, finishedAt: new Date().toISOString(), result };
  console.log('[cron]', JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
