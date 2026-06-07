/*
 * src/lib/server/unlock.ts
 *
 * Schedule-based unlock helpers (Student LK v2 Q1 + Q1.A review).
 *
 * Unlock conditions:
 *   1. enrollment_modules.unlock_override_at IS NOT NULL → unlocked (instructor override)
 *   2. now >= session.scheduled_at − LK_CONFIG.unlock_lead_hours → unlocked (schedule)
 *
 * Backward: прошедшие session-date модули всегда open.
 *
 * Если у модуля нет соответствующей session (data corruption или
 * cohort не имеет sessions для этого slug) → considered locked (info-hiding).
 *
 * Spec: docs/student-lk-v2-spec.md § 2 (sessions schema) + § 7 (LK_CONFIG).
 */

import { LK_CONFIG } from '../config/lk';

export type UnlockReason = 'schedule' | 'override' | 'no_session';

export interface UnlockState {
  unlocked: boolean;
  reason: UnlockReason;
  /** Когда модуль откроется (NULL если уже unlocked или нет session). */
  unlockAt: number | null;
  /** session.scheduled_at для этого module (NULL если нет session). */
  sessionScheduledAt: number | null;
}

interface UnlockQueryRow {
  override_at: number | null;
  scheduled_at: number | null;
}

/**
 * Compute unlock state для конкретного (enrollment, module).
 *
 * Использует JOIN enrollment_modules + enrollments → cohorts → sessions.
 *
 * @param env       Cloudflare bindings.
 * @param enrollmentId
 * @param moduleSlug
 * @param now       unix seconds (опц., default = current time).
 */
export async function getUnlockState(
  env: Cloudflare.Env,
  enrollmentId: string,
  moduleSlug: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<UnlockState> {
  const row = await env.DB.prepare(
    `SELECT em.unlock_override_at AS override_at,
            s.scheduled_at        AS scheduled_at
       FROM enrollment_modules em
       JOIN enrollments e ON e.id = em.enrollment_id
       LEFT JOIN sessions s
         ON s.cohort_id = (
              SELECT a.cohort_id FROM applications a
               WHERE a.enrollment_id = e.id
               LIMIT 1
            )
        AND s.module_slug = em.module_slug
      WHERE em.enrollment_id = ? AND em.module_slug = ?
      LIMIT 1`,
  )
    .bind(enrollmentId, moduleSlug)
    .first<UnlockQueryRow>();

  if (!row) {
    return {
      unlocked: false,
      reason: 'no_session',
      unlockAt: null,
      sessionScheduledAt: null,
    };
  }

  // Override wins
  if (row.override_at != null) {
    return {
      unlocked: true,
      reason: 'override',
      unlockAt: null,
      sessionScheduledAt: row.scheduled_at,
    };
  }

  // No session linked → locked
  if (row.scheduled_at == null) {
    return {
      unlocked: false,
      reason: 'no_session',
      unlockAt: null,
      sessionScheduledAt: null,
    };
  }

  const unlockAt = row.scheduled_at - LK_CONFIG.unlock_lead_hours * 3600;
  const unlocked = now >= unlockAt;

  return {
    unlocked,
    reason: 'schedule',
    unlockAt: unlocked ? null : unlockAt,
    sessionScheduledAt: row.scheduled_at,
  };
}

/**
 * Batch версия — для list-view (drawer, dashboard modules grid).
 *
 * Возвращает Map<module_slug, UnlockState> для всех модулей enrollment'а.
 */
export async function getUnlockStateBatch(
  env: Cloudflare.Env,
  enrollmentId: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<Map<string, UnlockState>> {
  const rows = await env.DB.prepare(
    `SELECT em.module_slug,
            em.unlock_override_at AS override_at,
            s.scheduled_at        AS scheduled_at
       FROM enrollment_modules em
       JOIN enrollments e ON e.id = em.enrollment_id
       LEFT JOIN sessions s
         ON s.cohort_id = (
              SELECT a.cohort_id FROM applications a
               WHERE a.enrollment_id = e.id
               LIMIT 1
            )
        AND s.module_slug = em.module_slug
      WHERE em.enrollment_id = ?`,
  )
    .bind(enrollmentId)
    .all<UnlockQueryRow & { module_slug: string }>();

  const result = new Map<string, UnlockState>();
  for (const row of rows.results) {
    if (row.override_at != null) {
      result.set(row.module_slug, {
        unlocked: true,
        reason: 'override',
        unlockAt: null,
        sessionScheduledAt: row.scheduled_at,
      });
      continue;
    }
    if (row.scheduled_at == null) {
      result.set(row.module_slug, {
        unlocked: false,
        reason: 'no_session',
        unlockAt: null,
        sessionScheduledAt: null,
      });
      continue;
    }
    const unlockAt = row.scheduled_at - LK_CONFIG.unlock_lead_hours * 3600;
    const unlocked = now >= unlockAt;
    result.set(row.module_slug, {
      unlocked,
      reason: 'schedule',
      unlockAt: unlocked ? null : unlockAt,
      sessionScheduledAt: row.scheduled_at,
    });
  }
  return result;
}

/**
 * Module completion check (Stage 26 Mark complete заменён schedule-based).
 *
 * Theory module (has_homework=0): done через theory_auto_done_delay_hours
 * после session.scheduled_at.
 *
 * Practical module (has_homework=1): done = exists approved/auto_approved
 * homework_submission.
 *
 * @returns completed: boolean
 */
export async function isModuleCompleted(
  env: Cloudflare.Env,
  enrollmentId: string,
  moduleSlug: string,
  hasHomework: boolean,
  sessionScheduledAt: number | null,
  now: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (hasHomework) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM homework_submissions
        WHERE enrollment_id = ? AND module_slug = ?
          AND status IN ('approved','auto_approved')`,
    )
      .bind(enrollmentId, moduleSlug)
      .first<{ n: number }>();
    return (row?.n ?? 0) > 0;
  }

  // Theory: done через delay после session.scheduled_at
  if (sessionScheduledAt == null) return false;
  return now >= sessionScheduledAt + LK_CONFIG.theory_auto_done_delay_hours * 3600;
}
