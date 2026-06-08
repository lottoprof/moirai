/*
 * src/lib/server/instructor-homework.ts
 *
 * Instructor homework review helpers (Student LK v2 Stage D).
 *
 * ACL: только lead_instructor видит submissions своих enrollment'ов
 * (Q2.H review). Co-instructors — future migrations.
 *
 * Spec: docs/student-lk-v2-spec.md § 4.3.
 */

import type { HomeworkStatus, HomeworkPriority } from '../../../db/types';
import { LK_CONFIG } from '../config/lk';

// ============================================================
// Queue display row
// ============================================================

export interface InstructorQueueItem {
  id: string;
  enrollment_id: string;
  user_id: string;
  student_name: string | null;
  student_email: string;
  module_slug: string;
  module_title: string | null;
  uploaded_at: number;
  is_late: number;
  status: HomeworkStatus;
  priority: HomeworkPriority;
  programme_slug: string;
  cohort_id: string;
}

interface RawQueueRow {
  id: string;
  enrollment_id: string;
  user_id: string;
  student_name: string | null;
  student_email: string;
  module_slug: string;
  module_title: string | null;
  uploaded_at: number;
  is_late: number;
  status: string;
  priority: string;
  programme_slug: string;
  cohort_id: string;
}

export interface QueueFilters {
  status?: HomeworkStatus;
  priority?: HomeworkPriority;
  is_late?: boolean;
}

/**
 * Pending submissions для review queue lead_instructor'a.
 *
 * Sort: priority='normal' first, потом uploaded_at ASC (oldest first).
 */
export async function getReviewQueue(
  env: Cloudflare.Env,
  instructorId: string,
  locale: 'en' | 'ru',
  filters: QueueFilters = {},
): Promise<InstructorQueueItem[]> {
  const where: string[] = [
    `e.lead_instructor_id = ?`,
    `e.status IN ('active','completed')`,
    `e.archived_at IS NULL`,
  ];
  const binds: unknown[] = [instructorId];

  if (filters.status) {
    where.push('hs.status = ?');
    binds.push(filters.status);
  } else {
    // По умолчанию только pending
    where.push(`hs.status = 'pending'`);
  }
  if (filters.priority) {
    where.push('hs.priority = ?');
    binds.push(filters.priority);
  }
  if (filters.is_late) {
    where.push('hs.is_late = 1');
  }

  const rows = await env.DB.prepare(
    `SELECT hs.id, hs.enrollment_id, e.user_id,
            u.name AS student_name, u.email AS student_email,
            hs.module_slug, m.title AS module_title,
            hs.uploaded_at, hs.is_late, hs.status, hs.priority,
            c.programme_id AS programme_slug, c.id AS cohort_id
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
       JOIN users u ON u.id = e.user_id
       JOIN applications a ON a.enrollment_id = e.id
       JOIN cohorts c ON c.id = a.cohort_id
       LEFT JOIN modules m ON m.slug = hs.module_slug AND m.locale = ?
      WHERE ${where.join(' AND ')}
      ORDER BY (hs.priority = 'normal') DESC, hs.uploaded_at ASC
      LIMIT 100`,
  )
    .bind(locale, ...binds)
    .all<RawQueueRow>();

  return rows.results.map((r) => ({
    id: r.id,
    enrollment_id: r.enrollment_id,
    user_id: r.user_id,
    student_name: r.student_name,
    student_email: r.student_email,
    module_slug: r.module_slug,
    module_title: r.module_title,
    uploaded_at: r.uploaded_at,
    is_late: r.is_late,
    status: r.status as HomeworkStatus,
    priority: r.priority as HomeworkPriority,
    programme_slug: r.programme_slug,
    cohort_id: r.cohort_id,
  }));
}

// ============================================================
// Overview metrics
// ============================================================

export interface ReviewMetrics {
  awaiting_review: number;
  oldest_pending_days: number | null;
  reviewed_this_week: number;
  auto_approved_this_week: number;
}

/**
 * Metrics для /instructor overview hero + stat cards.
 */
export async function getReviewMetrics(
  env: Cloudflare.Env,
  instructorId: string,
): Promise<ReviewMetrics> {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 86400;

  // Awaiting count + oldest pending (priority='normal' only)
  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MIN(hs.uploaded_at) AS oldest_at
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
      WHERE e.lead_instructor_id = ?
        AND e.archived_at IS NULL
        AND hs.status = 'pending'
        AND hs.priority = 'normal'`,
  )
    .bind(instructorId)
    .first<{ n: number; oldest_at: number | null }>();

  const oldestDays = pending?.oldest_at
    ? Math.floor((now - pending.oldest_at) / 86400)
    : null;

  // Reviewed this week (status set by this instructor)
  const reviewed = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
      WHERE e.lead_instructor_id = ?
        AND e.archived_at IS NULL
        AND hs.reviewed_by = ?
        AND hs.reviewed_at >= ?`,
  )
    .bind(instructorId, instructorId, weekAgo)
    .first<{ n: number }>();

  // Auto-approved this week (preпод не успел — дисциплина metric)
  const autoApproved = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
      WHERE e.lead_instructor_id = ?
        AND e.archived_at IS NULL
        AND hs.status = 'auto_approved'
        AND hs.reviewed_at >= ?`,
  )
    .bind(instructorId, weekAgo)
    .first<{ n: number }>();

  return {
    awaiting_review: pending?.n ?? 0,
    oldest_pending_days: oldestDays,
    reviewed_this_week: reviewed?.n ?? 0,
    auto_approved_this_week: autoApproved?.n ?? 0,
  };
}

// ============================================================
// Cohort overview cards (Instructor LK v2 Q2-expansion)
// ============================================================

export interface InstructorCohortCard {
  cohort_id: string;
  programme_slug: string;
  programme_title: string | null;
  start_date: number;
  end_date: number;
  status: string;
  active_students: number;
  pending_submissions: number;
  reviewed_this_week: number;
  late_submissions: number;
  next_session_at: number | null;
  next_session_module_slug: string | null;
  meeting_provider: string | null;
  meeting_url: string | null;
  meeting_host_url: string | null;
}

interface RawCohortRow {
  cohort_id: string;
  programme_slug: string;
  start_date: number;
  end_date: number;
  status: string;
  meeting_provider: string | null;
  meeting_url: string | null;
  meeting_host_url: string | null;
}

/**
 * Cohorts grid для /instructor overview (Q2-expansion).
 *
 * Возвращает cohorts где instructor — lead, с метриками ДЗ + next session +
 * Zoom URLs. Sort: status (running > open > completed/cancelled), потом
 * start_date DESC.
 */
export async function listInstructorCohorts(
  env: Cloudflare.Env,
  instructorId: string,
): Promise<InstructorCohortCard[]> {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 86400;

  // Step 1: cohorts where this instructor leads enrollments
  // (через JOIN enrollments) — могут быть cohorts без enrollments если
  // instructor назначен через slot.
  const cohortRows = await env.DB.prepare(
    `SELECT DISTINCT c.id AS cohort_id, c.programme_id AS programme_slug,
            c.start_date, c.end_date, c.status,
            c.meeting_provider, c.meeting_url, c.meeting_host_url
       FROM cohorts c
      WHERE (
        c.slot_id IN (SELECT id FROM slots WHERE instructor_id = ?)
        OR c.id IN (
          SELECT DISTINCT cohort_id FROM applications a
            JOIN enrollments e ON e.id = a.enrollment_id
           WHERE e.lead_instructor_id = ? AND e.archived_at IS NULL
        )
      )
        AND c.status IN ('open','running','completed')
      ORDER BY
        CASE c.status WHEN 'running' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
        c.start_date DESC
      LIMIT 50`,
  )
    .bind(instructorId, instructorId)
    .all<RawCohortRow>();

  const cards: InstructorCohortCard[] = [];
  for (const c of cohortRows.results) {
    // Active students
    const students = await env.DB.prepare(
      `SELECT COUNT(*) AS n
         FROM applications a
         JOIN enrollments e ON e.id = a.enrollment_id
        WHERE a.cohort_id = ?
          AND e.status = 'active'
          AND e.archived_at IS NULL`,
    )
      .bind(c.cohort_id)
      .first<{ n: number }>();

    // Pending + late submissions for this cohort
    const subStats = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN hs.status='pending' AND hs.priority='normal' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN hs.status='pending' AND hs.is_late=1 THEN 1 ELSE 0 END) AS late,
         SUM(CASE WHEN hs.reviewed_by = ? AND hs.reviewed_at >= ? THEN 1 ELSE 0 END) AS reviewed_week
        FROM homework_submissions hs
        JOIN enrollments e ON e.id = hs.enrollment_id
        JOIN applications a ON a.enrollment_id = e.id
       WHERE a.cohort_id = ? AND e.archived_at IS NULL`,
    )
      .bind(instructorId, weekAgo, c.cohort_id)
      .first<{ pending: number | null; late: number | null; reviewed_week: number | null }>();

    // Next live session — only relevant if cohort has students.
    // Empty cohorts ещё не "ведутся", показывать им next session — data noise.
    const studentsCount = students?.n ?? 0;
    const nextSession = studentsCount > 0
      ? await env.DB.prepare(
          `SELECT scheduled_at, module_slug
             FROM sessions
            WHERE cohort_id = ?
              AND scheduled_at > ?
              AND status = 'scheduled'
            ORDER BY scheduled_at ASC
            LIMIT 1`,
        )
          .bind(c.cohort_id, now)
          .first<{ scheduled_at: number; module_slug: string }>()
      : null;

    cards.push({
      cohort_id: c.cohort_id,
      programme_slug: c.programme_slug,
      programme_title: null, // resolved page-side через Content Collection
      start_date: c.start_date,
      end_date: c.end_date,
      status: c.status,
      active_students: studentsCount,
      pending_submissions: subStats?.pending ?? 0,
      reviewed_this_week: subStats?.reviewed_week ?? 0,
      late_submissions: subStats?.late ?? 0,
      next_session_at: nextSession?.scheduled_at ?? null,
      next_session_module_slug: nextSession?.module_slug ?? null,
      meeting_provider: c.meeting_provider,
      meeting_url: c.meeting_url,
      meeting_host_url: c.meeting_host_url,
    });
  }

  // Sort B (см. discussion 2026-06-08): running по next_session_at ASC
  // (ближайший live-урок сверху), open по start_date ASC (ближайший
  // запуск сверху), completed по end_date DESC (свежие закрытия сверху).
  const statusRank: Record<string, number> = { running: 0, open: 1, completed: 2 };
  cards.sort((a, b) => {
    const ar = statusRank[a.status] ?? 3;
    const br = statusRank[b.status] ?? 3;
    if (ar !== br) return ar - br;

    if (a.status === "running") {
      const an = a.next_session_at ?? Number.MAX_SAFE_INTEGER;
      const bn = b.next_session_at ?? Number.MAX_SAFE_INTEGER;
      if (an !== bn) return an - bn;
      return a.start_date - b.start_date;
    }
    if (a.status === "open") {
      return a.start_date - b.start_date;
    }
    if (a.status === "completed") {
      return b.end_date - a.end_date;
    }
    return 0;
  });

  return cards;
}

// ============================================================
// Cohort detail — matrix view (Q11)
// ============================================================

export interface CohortMatrixCell {
  module_slug: string;
  status: 'done' | 'active' | 'locked' | 'pending' | 'needs_revision';
  /** id последней submission для этого (enrollment, module) — null если ничего */
  last_submission_id: string | null;
  /** True если есть unlock_override для этого (enrollment, module) */
  has_override: boolean;
}

export interface CohortMatrixStudent {
  enrollment_id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  cells: CohortMatrixCell[];
}

export interface CohortMatrix {
  cohort_id: string;
  programme_slug: string;
  start_date: number;
  status: string;
  modules: { slug: string; title: string | null; order_idx: number }[];
  students: CohortMatrixStudent[];
  meeting_provider: string | null;
  meeting_join_url: string | null;
  next_session_at: number | null;
}

/**
 * Build full matrix для /instructor/cohorts/[id].
 * ACL: instructor must lead the cohort (via slot.instructor_id OR
 * enrollment.lead_instructor_id).
 *
 * Status derivation per cell:
 *   - submission approved/auto_approved → done
 *   - submission needs_revision        → needs_revision
 *   - submission pending               → pending
 *   - no submission + unlocked         → active
 *   - no submission + locked           → locked
 *
 * Unlock: now >= session.scheduled_at − unlock_lead_hours OR has override.
 */
export async function getCohortMatrix(
  env: Cloudflare.Env,
  instructorId: string,
  cohortId: string,
  locale: 'en' | 'ru',
): Promise<CohortMatrix | null> {
  // ACL + meta
  const cohort = await env.DB.prepare(
    `SELECT c.id, c.programme_id, c.start_date, c.status,
            c.meeting_provider, c.meeting_url, c.meeting_host_url,
            c.modules_snapshot_json
       FROM cohorts c
      WHERE c.id = ?
        AND (
          c.slot_id IN (SELECT id FROM slots WHERE instructor_id = ?)
          OR c.id IN (
            SELECT DISTINCT cohort_id FROM applications a
              JOIN enrollments e ON e.id = a.enrollment_id
             WHERE e.lead_instructor_id = ? AND e.archived_at IS NULL
          )
        )
      LIMIT 1`,
  )
    .bind(cohortId, instructorId, instructorId)
    .first<{
      id: string;
      programme_id: string;
      start_date: number;
      status: string;
      meeting_provider: string | null;
      meeting_url: string | null;
      meeting_host_url: string | null;
      modules_snapshot_json: string;
    }>();

  if (!cohort) return null;

  // Modules from snapshot
  let moduleSlugs: string[];
  try {
    moduleSlugs = JSON.parse(cohort.modules_snapshot_json) as string[];
  } catch {
    moduleSlugs = [];
  }
  if (moduleSlugs.length === 0) {
    return {
      cohort_id: cohort.id,
      programme_slug: cohort.programme_id,
      start_date: cohort.start_date,
      status: cohort.status,
      modules: [],
      students: [],
      meeting_provider: cohort.meeting_provider,
      meeting_join_url: cohort.meeting_host_url ?? cohort.meeting_url,
      next_session_at: null,
    };
  }

  const placeholders = moduleSlugs.map(() => '?').join(',');
  const moduleTitleRows = await env.DB.prepare(
    `SELECT slug, title FROM modules WHERE slug IN (${placeholders}) AND locale = ?`,
  )
    .bind(...moduleSlugs, locale)
    .all<{ slug: string; title: string }>();
  const moduleTitleMap = new Map(moduleTitleRows.results.map((r) => [r.slug, r.title]));
  const modules = moduleSlugs.map((slug, i) => ({
    slug,
    title: moduleTitleMap.get(slug) ?? null,
    order_idx: i,
  }));

  // Students
  const studentRows = await env.DB.prepare(
    `SELECT e.id AS enrollment_id, e.user_id, u.name, u.email
       FROM applications a
       JOIN enrollments e ON e.id = a.enrollment_id
       JOIN users u ON u.id = e.user_id
      WHERE a.cohort_id = ?
        AND e.status = 'active'
        AND e.archived_at IS NULL
      ORDER BY u.name, u.email`,
  )
    .bind(cohortId)
    .all<{ enrollment_id: string; user_id: string; name: string | null; email: string }>();

  // Sessions для unlock dates
  const sessionRows = await env.DB.prepare(
    `SELECT module_slug, scheduled_at, status FROM sessions WHERE cohort_id = ?`,
  )
    .bind(cohortId)
    .all<{ module_slug: string; scheduled_at: number; status: string }>();
  const sessionMap = new Map<string, { scheduled_at: number; status: string }>();
  for (const s of sessionRows.results) sessionMap.set(s.module_slug, { scheduled_at: s.scheduled_at, status: s.status });

  const now = Math.floor(Date.now() / 1000);
  const futureSessions = sessionRows.results
    .filter((s) => s.scheduled_at > now && s.status === 'scheduled')
    .sort((a, b) => a.scheduled_at - b.scheduled_at);
  const nextSessionAt = futureSessions[0]?.scheduled_at ?? null;

  // Per-student cells
  const UNLOCK_LEAD_SEC = 6 * 3600;
  const students: CohortMatrixStudent[] = [];

  for (const s of studentRows.results) {
    const submissions = await env.DB.prepare(
      `SELECT id, module_slug, status, uploaded_at
         FROM homework_submissions
        WHERE enrollment_id = ?
        ORDER BY uploaded_at DESC`,
    )
      .bind(s.enrollment_id)
      .all<{ id: string; module_slug: string; status: string; uploaded_at: number }>();

    const latestPerModule = new Map<string, { id: string; status: string }>();
    for (const sub of submissions.results) {
      if (!latestPerModule.has(sub.module_slug)) {
        latestPerModule.set(sub.module_slug, { id: sub.id, status: sub.status });
      }
    }

    const overrideRows = await env.DB.prepare(
      `SELECT module_slug FROM enrollment_modules
        WHERE enrollment_id = ? AND unlock_override_at IS NOT NULL`,
    )
      .bind(s.enrollment_id)
      .all<{ module_slug: string }>();
    const overrideSet = new Set(overrideRows.results.map((r) => r.module_slug));

    const cells: CohortMatrixCell[] = moduleSlugs.map((slug) => {
      const sub = latestPerModule.get(slug);
      const session = sessionMap.get(slug);
      const hasOverride = overrideSet.has(slug);

      let cellStatus: CohortMatrixCell['status'];
      if (sub) {
        if (sub.status === 'approved' || sub.status === 'auto_approved') cellStatus = 'done';
        else if (sub.status === 'needs_revision') cellStatus = 'needs_revision';
        else cellStatus = 'pending';
      } else {
        const unlocked = hasOverride
          || (session != null && now >= session.scheduled_at - UNLOCK_LEAD_SEC);
        cellStatus = unlocked ? 'active' : 'locked';
      }

      return {
        module_slug: slug,
        status: cellStatus,
        last_submission_id: sub?.id ?? null,
        has_override: hasOverride,
      };
    });

    students.push({
      enrollment_id: s.enrollment_id,
      user_id: s.user_id,
      student_name: s.name?.trim() || s.email.split('@')[0],
      student_email: s.email,
      cells,
    });
  }

  return {
    cohort_id: cohort.id,
    programme_slug: cohort.programme_id,
    start_date: cohort.start_date,
    status: cohort.status,
    modules,
    students,
    meeting_provider: cohort.meeting_provider,
    meeting_join_url: cohort.meeting_host_url ?? cohort.meeting_url,
    next_session_at: nextSessionAt,
  };
}

// ============================================================
// Submission detail для review page
// ============================================================

export interface SubmissionForReview {
  id: string;
  enrollment_id: string;
  user_id: string;
  student_name: string | null;
  student_email: string;
  module_slug: string;
  module_title: string | null;
  file_r2_key: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: number;
  is_late: number;
  student_comment: string | null;
  status: HomeworkStatus;
  priority: HomeworkPriority;
  reviewed_at: number | null;
  instructor_comment: string | null;
  instructor_annotation_r2_key: string | null;
  // Prior attempts для context (excluding this one)
  prior_count: number;
}

interface RawSubmissionForReviewRow {
  id: string;
  enrollment_id: string;
  user_id: string;
  student_name: string | null;
  student_email: string;
  module_slug: string;
  module_title: string | null;
  file_r2_key: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: number;
  is_late: number;
  student_comment: string | null;
  status: string;
  priority: string;
  reviewed_at: number | null;
  instructor_comment: string | null;
  instructor_annotation_r2_key: string | null;
}

/**
 * Submission detail с ACL check (lead_instructor для этого enrollment).
 *
 * Возвращает null если не lead OR archived OR not found.
 */
export async function getSubmissionForReview(
  env: Cloudflare.Env,
  instructorId: string,
  submissionId: string,
  locale: 'en' | 'ru',
): Promise<SubmissionForReview | null> {
  const row = await env.DB.prepare(
    `SELECT hs.id, hs.enrollment_id, e.user_id,
            u.name AS student_name, u.email AS student_email,
            hs.module_slug, m.title AS module_title,
            hs.file_r2_key, hs.content_type, hs.size_bytes,
            hs.uploaded_at, hs.is_late, hs.student_comment,
            hs.status, hs.priority,
            hs.reviewed_at, hs.instructor_comment,
            hs.instructor_annotation_r2_key
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
       JOIN users u ON u.id = e.user_id
       LEFT JOIN modules m ON m.slug = hs.module_slug AND m.locale = ?
      WHERE hs.id = ?
        AND e.lead_instructor_id = ?
        AND e.archived_at IS NULL
      LIMIT 1`,
  )
    .bind(locale, submissionId, instructorId)
    .first<RawSubmissionForReviewRow>();

  if (!row) return null;

  // Count prior attempts для same (enrollment, module), excluding this one
  const prior = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM homework_submissions
      WHERE enrollment_id = ? AND module_slug = ? AND id != ?`,
  )
    .bind(row.enrollment_id, row.module_slug, row.id)
    .first<{ n: number }>();

  return {
    id: row.id,
    enrollment_id: row.enrollment_id,
    user_id: row.user_id,
    student_name: row.student_name,
    student_email: row.student_email,
    module_slug: row.module_slug,
    module_title: row.module_title,
    file_r2_key: row.file_r2_key,
    content_type: row.content_type,
    size_bytes: row.size_bytes,
    uploaded_at: row.uploaded_at,
    is_late: row.is_late,
    student_comment: row.student_comment,
    status: row.status as HomeworkStatus,
    priority: row.priority as HomeworkPriority,
    reviewed_at: row.reviewed_at,
    instructor_comment: row.instructor_comment,
    instructor_annotation_r2_key: row.instructor_annotation_r2_key,
    prior_count: prior?.n ?? 0,
  };
}

// ============================================================
// Submit review
// ============================================================

export interface SubmitReviewParams {
  submissionId: string;
  instructorId: string;
  status: 'approved' | 'needs_revision';
  comment: string | null;
}

export interface SubmitReviewResult {
  success: boolean;
  /** При retry / already reviewed — current state. */
  current_status?: HomeworkStatus;
}

/**
 * Apply review verdict. Validation:
 *   - needs_revision требует non-empty comment.
 *   - approved comment опционален.
 *   - Comment ≤ LK_CONFIG.instructor_comment_max_chars.
 *   - Submission must быть pending (idempotent — second call после
 *     review просто no-op).
 */
export async function submitReview(
  env: Cloudflare.Env,
  params: SubmitReviewParams,
): Promise<SubmitReviewResult> {
  // Validate comment
  if (params.status === 'needs_revision' && (!params.comment || params.comment.trim().length === 0)) {
    return { success: false };
  }
  if (params.comment && params.comment.length > LK_CONFIG.instructor_comment_max_chars) {
    return { success: false };
  }

  const now = Math.floor(Date.now() / 1000);

  // Atomic UPDATE WHERE status='pending' (idempotent)
  const result = await env.DB.prepare(
    `UPDATE homework_submissions
        SET status = ?,
            instructor_comment = ?,
            reviewed_by = ?,
            reviewed_at = ?,
            updated_at = ?
      WHERE id = ?
        AND status = 'pending'
        AND enrollment_id IN (
          SELECT id FROM enrollments
           WHERE lead_instructor_id = ?
             AND archived_at IS NULL
        )`,
  )
    .bind(
      params.status,
      params.comment ?? null,
      params.instructorId,
      now,
      now,
      params.submissionId,
      params.instructorId,
    )
    .run();

  // Check if rows updated. If 0, either submission уже reviewed либо
  // нет access.
  const success = result.meta.changes > 0;

  if (!success) {
    // Return current state для UI feedback
    const current = await env.DB.prepare(
      `SELECT status FROM homework_submissions WHERE id = ?`,
    )
      .bind(params.submissionId)
      .first<{ status: string }>();
    return {
      success: false,
      current_status: current ? (current.status as HomeworkStatus) : undefined,
    };
  }

  return { success: true };
}

// ============================================================
// Annotation upload finalize
// ============================================================

export interface FinalizeAnnotationParams {
  submissionId: string;
  instructorId: string;
  fileR2Key: string;
  uploadedAt: number;
}

/**
 * Set instructor_annotation_r2_key после client PUT R2.
 * ACL check: lead_instructor.
 */
export async function finalizeAnnotation(
  env: Cloudflare.Env,
  params: FinalizeAnnotationParams,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE homework_submissions
        SET instructor_annotation_r2_key = ?,
            instructor_annotation_uploaded_at = ?,
            updated_at = ?
      WHERE id = ?
        AND enrollment_id IN (
          SELECT id FROM enrollments
           WHERE lead_instructor_id = ?
             AND archived_at IS NULL
        )`,
  )
    .bind(
      params.fileR2Key,
      params.uploadedAt,
      Math.floor(Date.now() / 1000),
      params.submissionId,
      params.instructorId,
    )
    .run();

  return result.meta.changes > 0;
}

// ============================================================
// Override unlock
// ============================================================

export interface OverrideParams {
  enrollmentId: string;
  moduleSlug: string;
  instructorId: string;
  reason?: string;
}

/**
 * Set unlock_override_at для (enrollment, module). ACL: lead_instructor.
 */
export async function createOverride(
  env: Cloudflare.Env,
  params: OverrideParams,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `UPDATE enrollment_modules
        SET unlock_override_at = ?,
            unlock_override_by = ?,
            unlock_override_reason = ?
      WHERE enrollment_id = ? AND module_slug = ?
        AND enrollment_id IN (
          SELECT id FROM enrollments
           WHERE lead_instructor_id = ?
             AND archived_at IS NULL
        )`,
  )
    .bind(
      now,
      params.instructorId,
      params.reason ?? null,
      params.enrollmentId,
      params.moduleSlug,
      params.instructorId,
    )
    .run();
  return result.meta.changes > 0;
}

/**
 * Remove override (UPDATE → NULL).
 */
export async function removeOverride(
  env: Cloudflare.Env,
  params: Omit<OverrideParams, 'reason'>,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE enrollment_modules
        SET unlock_override_at = NULL,
            unlock_override_by = NULL,
            unlock_override_reason = NULL
      WHERE enrollment_id = ? AND module_slug = ?
        AND enrollment_id IN (
          SELECT id FROM enrollments
           WHERE lead_instructor_id = ?
             AND archived_at IS NULL
        )`,
  )
    .bind(params.enrollmentId, params.moduleSlug, params.instructorId)
    .run();
  return result.meta.changes > 0;
}
