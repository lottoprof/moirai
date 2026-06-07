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
            hs.uploaded_at, hs.is_late, hs.status, hs.priority
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
       JOIN users u ON u.id = e.user_id
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
