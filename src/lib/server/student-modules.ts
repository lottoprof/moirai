/*
 * Student modules — query helpers (Student LK v2 Stage B rewrite).
 *
 * Replaces stage26 sequential unlock logic with schedule-based unlock
 * via sessions table (см. src/lib/server/unlock.ts).
 *
 * Used by:
 *   - /[locale]/dashboard (listEnrollmentModules + getCurrentEnrollmentProgress)
 *   - /[locale]/dashboard/modules/[slug] (getModuleForStudent + markModuleViewed)
 *
 * Stage B changes from stage26:
 *   - Sequential unlock (prevDone) → schedule-based (getUnlockState).
 *   - body_r2_key → workbook_r2_key + presentation_r2_key.
 *   - homework_md removed (описание ДЗ — секция в workbook).
 *   - markModuleComplete removed (Mark complete CTA убран — Q1).
 *   - markModuleOpened → markModuleViewed (view_status='viewed' вместо 'in_progress').
 *   - getCurrentEnrollmentProgress: current = first unlocked non-done OR
 *     allCaughtUp если все unlocked done.
 *
 * Spec: docs/student-lk-v2-spec.md § 8 Stage B.
 */

import type { Locale } from '../../../db/types';
import { getUnlockStateBatch, getUnlockState, isModuleCompleted, type UnlockState } from './unlock';

// ============================================================
// Module entry для list view (drawer, dashboard modules grid)
// ============================================================

export type ModuleUiStatus = 'done' | 'active' | 'locked';

export interface StudentModuleEntry {
  slug: string;
  title: string;
  track: string | null;
  summary: string | null;
  has_homework: number;
  default_lessons: number;
  order_idx: number;
  /** UI status — derived from unlock + completion. */
  status: ModuleUiStatus;
  /** Schedule-based unlock state. */
  unlocked: boolean;
  /** Когда модуль откроется (NULL если уже unlocked или нет session). */
  unlock_at: number | null;
  /** session.scheduled_at — для display в drawer/grid (next session date). */
  session_scheduled_at: number | null;
}

interface RawJoinRow {
  slug: string;
  order_idx: number;
  // LEFT JOIN modules может вернуть NULL (orphan slug)
  title: string | null;
  track: string | null;
  summary: string | null;
  has_homework: number | null;
  default_lessons: number | null;
}

/**
 * Список модулей enrollment'а со status + unlock info.
 *
 * Status:
 *   - 'done' — completion (см. isModuleCompleted в unlock.ts).
 *   - 'locked' — !unlocked.
 *   - 'active' — unlocked && !done.
 *
 * Locale нужен для JOIN на modules.title (2 rows per slug, по локалям).
 */
export async function listEnrollmentModules(
  env: Cloudflare.Env,
  enrollmentId: string,
  locale: Locale,
): Promise<StudentModuleEntry[]> {
  const now = Math.floor(Date.now() / 1000);

  // 1. Fetch enrollment_modules + module metadata
  const rows = await env.DB.prepare(
    `SELECT em.module_slug   AS slug,
            em.order_idx     AS order_idx,
            m.title,
            m.track,
            m.summary,
            m.has_homework,
            m.default_lessons
       FROM enrollment_modules em
       LEFT JOIN modules m
         ON m.slug = em.module_slug AND m.locale = ?
      WHERE em.enrollment_id = ?
      ORDER BY em.order_idx ASC`,
  )
    .bind(locale, enrollmentId)
    .all<RawJoinRow>();

  // 2. Batch unlock states
  const unlockMap = await getUnlockStateBatch(env, enrollmentId, now);

  // 3. Compute completion per module (sequential awaits — D1 не parallel-friendly
  //    out of the box, optimize Sprint 2 если упрёмся в latency)
  const result: StudentModuleEntry[] = [];
  for (const r of rows.results) {
    const unlock: UnlockState = unlockMap.get(r.slug) ?? {
      unlocked: false,
      reason: 'no_session',
      unlockAt: null,
      sessionScheduledAt: null,
    };

    const done = await isModuleCompleted(
      env,
      enrollmentId,
      r.slug,
      Boolean(r.has_homework ?? 0),
      unlock.sessionScheduledAt,
      now,
    );

    let status: ModuleUiStatus;
    if (done) status = 'done';
    else if (!unlock.unlocked) status = 'locked';
    else status = 'active';

    result.push({
      slug: r.slug,
      title: r.title ?? r.slug,
      track: r.track,
      summary: r.summary,
      has_homework: r.has_homework ?? 0,
      default_lessons: r.default_lessons ?? 0,
      order_idx: r.order_idx,
      status,
      unlocked: unlock.unlocked,
      unlock_at: unlock.unlockAt,
      session_scheduled_at: unlock.sessionScheduledAt,
    });
  }
  return result;
}

// ============================================================
// Module detail (для page)
// ============================================================

export interface StudentModuleDetail {
  enrollment_id: string;
  slug: string;
  title: string;
  track: string | null;
  summary: string | null;
  objectives_json: string;
  concepts_json: string;
  has_homework: number;
  has_video: number;
  has_external_video: number;
  default_lessons: number;
  order_idx: number;
  /** Storage keys — Stage B new fields. */
  presentation_r2_key: string | null;
  workbook_r2_key: string | null;
  /** Unlock info. */
  unlocked: boolean;
  unlock_at: number | null;
  session_scheduled_at: number | null;
  /** Module-level completion (для UI badge "Completed"). */
  done: boolean;
}

interface ModuleDetailRow {
  enrollment_id: string;
  slug: string;
  order_idx: number;
  title: string | null;
  track: string | null;
  summary: string | null;
  objectives_json: string | null;
  concepts_json: string | null;
  has_homework: number | null;
  has_video: number | null;
  has_external_video: number | null;
  default_lessons: number | null;
  presentation_r2_key: string | null;
  workbook_r2_key: string | null;
}

/**
 * Resolve module для student: ownership check + unlock check.
 *
 * Returns null если:
 *   - module не принадлежит этому student'у (нет enrollment_modules row);
 *   - enrollment archived или not active/completed.
 *
 * Locked модули возвращаются с `unlocked: false` — caller решает что делать
 * (page render → 404 для info-hiding, см. spec § 3 ACL).
 */
export async function getModuleForStudent(
  env: Cloudflare.Env,
  userId: string,
  slug: string,
  locale: Locale,
): Promise<StudentModuleDetail | null> {
  const row = await env.DB.prepare(
    `SELECT e.id              AS enrollment_id,
            em.module_slug    AS slug,
            em.order_idx,
            m.title, m.track, m.summary,
            m.objectives_json, m.concepts_json,
            m.has_homework, m.has_video, m.has_external_video,
            m.default_lessons,
            m.presentation_r2_key,
            m.workbook_r2_key
       FROM enrollments e
       JOIN enrollment_modules em ON em.enrollment_id = e.id
       LEFT JOIN modules m
         ON m.slug = em.module_slug AND m.locale = ?
      WHERE e.user_id = ?
        AND em.module_slug = ?
        AND e.status IN ('active','completed')
        AND e.archived_at IS NULL
      LIMIT 1`,
  )
    .bind(locale, userId, slug)
    .first<ModuleDetailRow>();

  if (!row) return null;

  const unlock = await getUnlockState(env, row.enrollment_id, slug);
  const done = await isModuleCompleted(
    env,
    row.enrollment_id,
    slug,
    Boolean(row.has_homework ?? 0),
    unlock.sessionScheduledAt,
  );

  return {
    enrollment_id: row.enrollment_id,
    slug: row.slug,
    title: row.title ?? row.slug,
    track: row.track,
    summary: row.summary,
    objectives_json: row.objectives_json ?? '[]',
    concepts_json: row.concepts_json ?? '[]',
    has_homework: row.has_homework ?? 0,
    has_video: row.has_video ?? 0,
    has_external_video: row.has_external_video ?? 0,
    default_lessons: row.default_lessons ?? 0,
    order_idx: row.order_idx,
    presentation_r2_key: row.presentation_r2_key,
    workbook_r2_key: row.workbook_r2_key,
    unlocked: unlock.unlocked,
    unlock_at: unlock.unlockAt,
    session_scheduled_at: unlock.sessionScheduledAt,
    done,
  };
}

// ============================================================
// Module view tracking
// ============================================================

/**
 * Mark module как viewed (Stage B replaces markModuleOpened).
 *
 * Lazy creation: если row не существует — INSERT с view_status='viewed'.
 * Idempotent — не перетирает если уже 'viewed'.
 */
export async function markModuleViewed(
  env: Cloudflare.Env,
  enrollmentId: string,
  slug: string,
  locale: Locale,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO module_progress
       (enrollment_id, module_slug, locale, view_status,
        last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, 'viewed', ?, ?, ?)
     ON CONFLICT (enrollment_id, module_slug) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       locale = excluded.locale,
       view_status = 'viewed'`,
  )
    .bind(enrollmentId, slug, locale, now, now, now)
    .run();
}

// ============================================================
// Dashboard summary (для overview)
// ============================================================

export interface EnrollmentProgress {
  enrollment_id: string;
  programme_slug: string;
  total_modules: number;
  done_modules: number;
  /** Current module slug — первый unlocked non-done. NULL если allCaughtUp или нет модулей. */
  current_module_slug: string | null;
  /** True если все unlocked done — показываем "All caught up" card. */
  all_caught_up: boolean;
  /** Когда следующий locked модуль откроется (NULL если все open). */
  next_unlock_at: number | null;
}

/**
 * Summary активного enrollment'а — для dashboard stats + Continue card.
 *
 * "Current module" = first unlocked non-done.
 * "All caught up" = все unlocked done, но есть locked будущие.
 */
export async function getCurrentEnrollmentProgress(
  env: Cloudflare.Env,
  userId: string,
): Promise<EnrollmentProgress | null> {
  const enrollment = await env.DB.prepare(
    `SELECT id, programme_slug
       FROM enrollments
       WHERE user_id = ? AND status = 'active' AND archived_at IS NULL
       ORDER BY enrolled_at DESC
       LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: string; programme_slug: string }>();

  if (!enrollment) return null;

  // Используем listEnrollmentModules для consistent computation.
  // Locale не критичен — нам нужны status flags, не title strings.
  const modules = await listEnrollmentModules(env, enrollment.id, 'en');

  const total = modules.length;
  const doneCount = modules.filter((m) => m.status === 'done').length;
  const firstActive = modules.find((m) => m.status === 'active');
  const firstLocked = modules.find((m) => m.status === 'locked');

  const allCaughtUp = !firstActive && total > 0 && doneCount === modules.filter((m) => m.unlocked).length;

  return {
    enrollment_id: enrollment.id,
    programme_slug: enrollment.programme_slug,
    total_modules: total,
    done_modules: doneCount,
    current_module_slug: firstActive?.slug ?? null,
    all_caught_up: allCaughtUp,
    next_unlock_at: firstLocked?.unlock_at ?? null,
  };
}
