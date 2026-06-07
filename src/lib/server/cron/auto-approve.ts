/*
 * src/lib/server/cron/auto-approve.ts
 *
 * Auto-approve homework cron — Stage F.
 *
 * Trigger: каждые 15 мин (через wrangler [triggers] cron или external scheduler).
 *
 * Logic: для каждой pending submission, если она uploaded ДО next
 * non-cancelled session.scheduled_at + grace period — переключаем в
 * auto_approved.
 *
 * Spec: docs/student-lk-v2-spec.md § 6.2 + Q1+Q2.A review.
 */

import { LK_CONFIG } from '../../config/lk';

interface PendingRow {
  id: string;
  enrollment_id: string;
  module_slug: string;
}

export interface AutoApproveResult {
  processed: number;
  errors: number;
  duration_ms: number;
}

/**
 * Run auto-approve pass.
 *
 * Find pending submissions where uploaded_at < next_session.scheduled_at,
 * AND now > next_session.scheduled_at + 1h grace (defensive — даём
 * preподу время).
 */
export async function runAutoApprove(env: Cloudflare.Env): Promise<AutoApproveResult> {
  const start = Date.now();
  const now = Math.floor(start / 1000);
  const gracePeriodSec = 3600;

  // Find candidates: pending, uploaded < next session, now > next session + grace
  const rows = await env.DB.prepare(
    `SELECT hs.id, hs.enrollment_id, hs.module_slug
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
      WHERE hs.status = 'pending'
        AND e.archived_at IS NULL
        AND hs.uploaded_at < (
          SELECT MIN(s.scheduled_at) FROM sessions s
           WHERE s.cohort_id = (
             SELECT a.cohort_id FROM applications a
              WHERE a.enrollment_id = e.id
              LIMIT 1
           )
             AND s.status != 'cancelled'
             AND s.order_idx > (
               SELECT order_idx FROM sessions
                WHERE cohort_id = (
                  SELECT a.cohort_id FROM applications a
                   WHERE a.enrollment_id = e.id
                   LIMIT 1
                )
                  AND module_slug = hs.module_slug
             )
        )
        AND ? > (
          SELECT MIN(s.scheduled_at) FROM sessions s
           WHERE s.cohort_id = (
             SELECT a.cohort_id FROM applications a
              WHERE a.enrollment_id = e.id
              LIMIT 1
           )
             AND s.status != 'cancelled'
             AND s.order_idx > (
               SELECT order_idx FROM sessions
                WHERE cohort_id = (
                  SELECT a.cohort_id FROM applications a
                   WHERE a.enrollment_id = e.id
                   LIMIT 1
                )
                  AND module_slug = hs.module_slug
             )
        ) + ?
      LIMIT ?`,
  )
    .bind(now, gracePeriodSec, LK_CONFIG.cron_batch_size)
    .all<PendingRow>();

  let processed = 0;
  let errors = 0;

  for (const row of rows.results) {
    try {
      const result = await env.DB.prepare(
        `UPDATE homework_submissions
            SET status = 'auto_approved',
                reviewed_at = ?,
                updated_at = ?
          WHERE id = ? AND status = 'pending'`,
      )
        .bind(now, now, row.id)
        .run();
      if (result.meta.changes > 0) processed++;
    } catch (err) {
      console.error('[cron/auto-approve] error на row', row.id, err);
      errors++;
    }
  }

  return { processed, errors, duration_ms: Date.now() - start };
}
