/*
 * Student modules — query helpers + progress tracking (Stage 26b).
 *
 * Используется в:
 *   - /[locale]/dashboard (listEnrollmentModules — full list с progress)
 *   - /[locale]/dashboard/modules/[slug] (getModuleForStudent + markInProgress)
 *   - /api/student/modules/[slug]/complete (markComplete)
 *
 * Sequential unlock: модуль доступен только если все enrollment_modules
 * с меньшим order_idx имеют status='done' в module_progress.
 * Альтернатива (Sprint 2+): через modules.requires_modules_json explicit deps.
 */

import type {
  ModuleProgressStatus,
  Locale,
} from "../../../db/types";

// ============================================================
// JOIN-result types
// ============================================================

/** Module entry для student dashboard — metadata + position + progress. */
export interface StudentModuleEntry {
  slug: string;
  title: string;
  track: string | null;
  has_video: number;
  has_external_video: number;
  has_homework: number;
  default_lessons: number;
  order_idx: number;
  /** null если row module_progress ещё не создан (lazy init на page open) */
  status: ModuleProgressStatus | null;
  completed_at: number | null;
  /** unlocked = можно открыть страницу модуля */
  unlocked: boolean;
}

interface RawJoinRow {
  slug: string;
  // LEFT JOIN modules может вернуть NULL для всех полей m.*, если
  // соответствующего ряда в modules нет (orphan slug). Поэтому полей
  // m.title / m.track / m.has_* / m.default_lessons — nullable.
  title: string | null;
  track: string | null;
  has_video: number | null;
  has_external_video: number | null;
  has_homework: number | null;
  default_lessons: number | null;
  order_idx: number;
  status: string | null;
  completed_at: number | null;
}

/**
 * Список модулей enrollment'а с progress и unlocked flag.
 *
 * Sequential unlock: первый модуль всегда unlocked; каждый следующий
 * unlocked если предыдущий done.
 *
 * Locale нужен для JOIN на modules.title (модуль в коллекции 2 row,
 * по одной на язык; берём ту что соответствует user.locale).
 */
export async function listEnrollmentModules(
  env: Cloudflare.Env,
  enrollmentId: string,
  locale: Locale,
): Promise<StudentModuleEntry[]> {
  const rows = await env.DB.prepare(
    `SELECT
       em.module_slug AS slug,
       m.title,
       m.track,
       m.has_video,
       m.has_external_video,
       m.has_homework,
       m.default_lessons,
       em.order_idx,
       mp.status,
       mp.completed_at
     FROM enrollment_modules em
     LEFT JOIN modules m
       ON m.slug = em.module_slug AND m.locale = ?
     LEFT JOIN module_progress mp
       ON mp.enrollment_id = em.enrollment_id
      AND mp.module_slug = em.module_slug
     WHERE em.enrollment_id = ?
     ORDER BY em.order_idx ASC`,
  )
    .bind(locale, enrollmentId)
    .all<RawJoinRow>();

  // Compute unlocked sequentially
  let prevDone = true; // первый module always unlocked
  const result: StudentModuleEntry[] = [];
  for (const r of rows.results) {
    const status: ModuleProgressStatus | null =
      r.status === "not_started" || r.status === "in_progress" || r.status === "done"
        ? r.status
        : null;
    const unlocked = prevDone;
    result.push({
      slug: r.slug,
      title: r.title ?? r.slug,
      track: r.track,
      has_video: r.has_video ?? 0,
      has_external_video: r.has_external_video ?? 0,
      has_homework: r.has_homework ?? 0,
      default_lessons: r.default_lessons ?? 0,
      order_idx: r.order_idx,
      status,
      completed_at: r.completed_at,
      unlocked,
    });
    prevDone = status === "done";
  }
  return result;
}

/**
 * Resolve module для student: проверяет ownership (enrollment user'a
 * содержит этот module), возвращает metadata + progress + unlocked.
 * Null если модуль не принадлежит студенту.
 */
export interface StudentModuleDetail extends StudentModuleEntry {
  enrollment_id: string;
  body_r2_key: string;
  summary: string | null;
  objectives_json: string;
  concepts_json: string;
  homework_md: string | null;
}

export async function getModuleForStudent(
  env: Cloudflare.Env,
  userId: string,
  slug: string,
  locale: Locale,
): Promise<StudentModuleDetail | null> {
  const row = await env.DB.prepare(
    `SELECT
       e.id AS enrollment_id,
       em.module_slug AS slug,
       em.order_idx,
       m.title, m.track,
       m.has_video, m.has_external_video, m.has_homework,
       m.default_lessons,
       m.body_r2_key,
       m.summary,
       m.objectives_json,
       m.concepts_json,
       m.homework_md,
       mp.status,
       mp.completed_at
     FROM enrollments e
     JOIN enrollment_modules em ON em.enrollment_id = e.id
     LEFT JOIN modules m ON m.slug = em.module_slug AND m.locale = ?
     LEFT JOIN module_progress mp
       ON mp.enrollment_id = e.id AND mp.module_slug = em.module_slug
     WHERE e.user_id = ?
       AND em.module_slug = ?
       AND e.status IN ('active','completed')
     LIMIT 1`,
  )
    .bind(locale, userId, slug)
    .first<{
      enrollment_id: string;
      slug: string;
      order_idx: number;
      title: string | null;
      track: string | null;
      has_video: number | null;
      has_external_video: number | null;
      has_homework: number | null;
      default_lessons: number | null;
      body_r2_key: string | null;
      summary: string | null;
      objectives_json: string | null;
      concepts_json: string | null;
      homework_md: string | null;
      status: string | null;
      completed_at: number | null;
    }>();

  if (!row || !row.body_r2_key) return null;

  // Compute unlocked: проверить что все предыдущие модули done
  const prereqDone = await env.DB.prepare(
    `SELECT COUNT(*) AS pending
       FROM enrollment_modules em
       LEFT JOIN module_progress mp
         ON mp.enrollment_id = em.enrollment_id AND mp.module_slug = em.module_slug
      WHERE em.enrollment_id = ?
        AND em.order_idx < ?
        AND (mp.status IS NULL OR mp.status != 'done')`,
  )
    .bind(row.enrollment_id, row.order_idx)
    .first<{ pending: number }>();
  const unlocked = (prereqDone?.pending ?? 0) === 0;

  const status: ModuleProgressStatus | null =
    row.status === "not_started" || row.status === "in_progress" || row.status === "done"
      ? row.status
      : null;

  return {
    enrollment_id: row.enrollment_id,
    slug: row.slug,
    title: row.title ?? row.slug,
    track: row.track,
    has_video: row.has_video ?? 0,
    has_external_video: row.has_external_video ?? 0,
    has_homework: row.has_homework ?? 0,
    default_lessons: row.default_lessons ?? 0,
    order_idx: row.order_idx,
    status,
    completed_at: row.completed_at,
    unlocked,
    body_r2_key: row.body_r2_key,
    summary: row.summary,
    objectives_json: row.objectives_json ?? "[]",
    concepts_json: row.concepts_json ?? "[]",
    homework_md: row.homework_md,
  };
}

/**
 * Mark module открытым (status=in_progress) если ещё не started.
 * Idempotent — не перетирает done.
 *
 * Lazy creation: если row не существует — INSERT с in_progress.
 */
export async function markModuleOpened(
  env: Cloudflare.Env,
  enrollmentId: string,
  slug: string,
  locale: Locale,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // UPSERT pattern для D1 (SQLite)
  await env.DB.prepare(
    `INSERT INTO module_progress
       (enrollment_id, module_slug, locale, status, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, 'in_progress', ?, ?, ?)
     ON CONFLICT (enrollment_id, module_slug) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       locale = excluded.locale,
       status = CASE WHEN module_progress.status = 'not_started'
                     THEN 'in_progress'
                     ELSE module_progress.status END`,
  )
    .bind(enrollmentId, slug, locale, now, now, now)
    .run();
}

/**
 * Mark module как done (explicit "Mark complete" от user'a).
 * Идемпотентно — если уже done, не меняем completed_at.
 */
export async function markModuleComplete(
  env: Cloudflare.Env,
  enrollmentId: string,
  slug: string,
  locale: Locale,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO module_progress
       (enrollment_id, module_slug, locale, status, last_seen_at, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'done', ?, ?, ?, ?)
     ON CONFLICT (enrollment_id, module_slug) DO UPDATE SET
       status = 'done',
       completed_at = COALESCE(module_progress.completed_at, excluded.completed_at),
       last_seen_at = excluded.last_seen_at`,
  )
    .bind(enrollmentId, slug, locale, now, now, now, now)
    .run();
}

// ============================================================
// Dashboard summary — для top stats
// ============================================================

export interface EnrollmentProgress {
  enrollment_id: string;
  programme_slug: string;
  total_modules: number;
  done_modules: number;
  current_module_slug: string | null; // первый non-done в order
}

/**
 * Получить summary активного enrollment'a студента — для dashboard
 * stats + "Continue learning" CTA. Если у user несколько active
 * enrollments — берём самый свежий (enrolled_at desc).
 */
export async function getCurrentEnrollmentProgress(
  env: Cloudflare.Env,
  userId: string,
): Promise<EnrollmentProgress | null> {
  const enrollment = await env.DB.prepare(
    `SELECT id, programme_slug
       FROM enrollments
       WHERE user_id = ? AND status = 'active'
       ORDER BY enrolled_at DESC
       LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: string; programme_slug: string }>();

  if (!enrollment) return null;

  const totals = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN mp.status = 'done' THEN 1 ELSE 0 END) AS done
     FROM enrollment_modules em
     LEFT JOIN module_progress mp
       ON mp.enrollment_id = em.enrollment_id AND mp.module_slug = em.module_slug
     WHERE em.enrollment_id = ?`,
  )
    .bind(enrollment.id)
    .first<{ total: number; done: number | null }>();

  const current = await env.DB.prepare(
    `SELECT em.module_slug
       FROM enrollment_modules em
       LEFT JOIN module_progress mp
         ON mp.enrollment_id = em.enrollment_id AND mp.module_slug = em.module_slug
       WHERE em.enrollment_id = ?
         AND (mp.status IS NULL OR mp.status != 'done')
       ORDER BY em.order_idx ASC
       LIMIT 1`,
  )
    .bind(enrollment.id)
    .first<{ module_slug: string }>();

  return {
    enrollment_id: enrollment.id,
    programme_slug: enrollment.programme_slug,
    total_modules: totals?.total ?? 0,
    done_modules: totals?.done ?? 0,
    current_module_slug: current?.module_slug ?? null,
  };
}
