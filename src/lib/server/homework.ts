/*
 * src/lib/server/homework.ts
 *
 * Homework query + mutation helpers (Student LK v2 Stage C).
 *
 * Used by:
 *   - /api/student/homework/* endpoints
 *   - /[locale]/dashboard/homework/index.astro (aggregate)
 *   - /[locale]/dashboard/modules/[slug].astro (inline submissions)
 *
 * Spec: docs/student-lk-v2-spec.md § 2.1 (homework_submissions) + § 4.2.
 */

import type { HomeworkStatus, HomeworkPriority } from '../../../db/types';

// ============================================================
// Row shape (subset of HomeworkSubmissionRow для UI display)
// ============================================================

export interface SubmissionDisplay {
  id: string;
  enrollment_id: string;
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
  reviewed_by: string | null;
  reviewer_name: string | null;
  instructor_comment: string | null;
  instructor_annotation_r2_key: string | null;
  instructor_annotation_uploaded_at: number | null;
  /** True если для (enrollment, module) есть более свежая submission.
   *  Используется на UI для опускания старых attempts (opacity + neutral
   *  border) и скрытия CTA "Submit new version" — действие уже сделано
   *  студентом, новая попытка ждёт ревью. */
  is_superseded: boolean;
}

interface RawSubmissionRow {
  id: string;
  enrollment_id: string;
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
  reviewed_by: string | null;
  reviewer_name: string | null;
  instructor_comment: string | null;
  instructor_annotation_r2_key: string | null;
  instructor_annotation_uploaded_at: number | null;
  is_superseded: number;
}

function normalizeRow(row: RawSubmissionRow, locale: 'en' | 'ru'): SubmissionDisplay {
  void locale; // module_title уже отфильтрован по locale в JOIN
  return {
    id: row.id,
    enrollment_id: row.enrollment_id,
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
    reviewed_by: row.reviewed_by,
    reviewer_name: row.reviewer_name,
    instructor_comment: row.instructor_comment,
    instructor_annotation_r2_key: row.instructor_annotation_r2_key,
    instructor_annotation_uploaded_at: row.instructor_annotation_uploaded_at,
    is_superseded: row.is_superseded === 1,
  };
}

/* SQL подзапрос: есть ли в homework_submissions более свежая попытка
   для той же (enrollment_id, module_slug) пары. Используем 1/0 чтобы
   D1 не превращал boolean в строку. */
const SUPERSEDED_SQL = `
  EXISTS(
    SELECT 1 FROM homework_submissions hs2
     WHERE hs2.enrollment_id = hs.enrollment_id
       AND hs2.module_slug = hs.module_slug
       AND hs2.uploaded_at > hs.uploaded_at
  ) AS is_superseded`;

// ============================================================
// List queries
// ============================================================

export interface ListSubmissionsFilters {
  status?: HomeworkStatus;
  is_late?: boolean;
  module_slug?: string;
}

/**
 * List submissions для student'a (all enrollments active+completed, не archived).
 *
 * Sort: uploaded_at DESC (newest first).
 */
export async function listSubmissionsForStudent(
  env: Cloudflare.Env,
  userId: string,
  locale: 'en' | 'ru',
  filters: ListSubmissionsFilters = {},
): Promise<SubmissionDisplay[]> {
  const where: string[] = [
    `e.user_id = ?`,
    `e.status IN ('active','completed')`,
    `e.archived_at IS NULL`,
  ];
  const binds: unknown[] = [userId];

  if (filters.status) {
    where.push('hs.status = ?');
    binds.push(filters.status);
  }
  if (filters.is_late) {
    where.push('hs.is_late = 1');
  }
  if (filters.module_slug) {
    where.push('hs.module_slug = ?');
    binds.push(filters.module_slug);
  }

  const sql = `
    SELECT hs.id, hs.enrollment_id, hs.module_slug,
           m.title AS module_title,
           hs.file_r2_key, hs.content_type, hs.size_bytes,
           hs.uploaded_at, hs.is_late, hs.student_comment,
           hs.status, hs.priority,
           hs.reviewed_at, hs.reviewed_by,
           u.name AS reviewer_name,
           hs.instructor_comment,
           hs.instructor_annotation_r2_key, hs.instructor_annotation_uploaded_at,
           ${SUPERSEDED_SQL}
      FROM homework_submissions hs
      JOIN enrollments e ON e.id = hs.enrollment_id
      LEFT JOIN modules m ON m.slug = hs.module_slug AND m.locale = ?
      LEFT JOIN users u ON u.id = hs.reviewed_by
     WHERE ${where.join(' AND ')}
     ORDER BY hs.uploaded_at DESC
     LIMIT 200`;

  const rows = await env.DB.prepare(sql)
    .bind(locale, ...binds)
    .all<RawSubmissionRow>();

  return rows.results.map((r) => normalizeRow(r, locale));
}

/**
 * Submissions для конкретного module внутри enrollment'а.
 *
 * Used by module page (inline homework section).
 */
export async function listSubmissionsForModule(
  env: Cloudflare.Env,
  enrollmentId: string,
  moduleSlug: string,
  locale: 'en' | 'ru',
): Promise<SubmissionDisplay[]> {
  const rows = await env.DB.prepare(
    `SELECT hs.id, hs.enrollment_id, hs.module_slug,
            m.title AS module_title,
            hs.file_r2_key, hs.content_type, hs.size_bytes,
            hs.uploaded_at, hs.is_late, hs.student_comment,
            hs.status, hs.priority,
            hs.reviewed_at, hs.reviewed_by,
            u.name AS reviewer_name,
            hs.instructor_comment,
            hs.instructor_annotation_r2_key, hs.instructor_annotation_uploaded_at,
            ${SUPERSEDED_SQL}
       FROM homework_submissions hs
       LEFT JOIN modules m ON m.slug = hs.module_slug AND m.locale = ?
       LEFT JOIN users u ON u.id = hs.reviewed_by
      WHERE hs.enrollment_id = ? AND hs.module_slug = ?
      ORDER BY hs.uploaded_at DESC`,
  )
    .bind(locale, enrollmentId, moduleSlug)
    .all<RawSubmissionRow>();

  return rows.results.map((r) => normalizeRow(r, locale));
}

/**
 * Single submission с ownership check.
 *
 * @returns null если не найдено или не принадлежит userId.
 */
export async function getSubmissionForStudent(
  env: Cloudflare.Env,
  userId: string,
  submissionId: string,
  locale: 'en' | 'ru',
): Promise<SubmissionDisplay | null> {
  const row = await env.DB.prepare(
    `SELECT hs.id, hs.enrollment_id, hs.module_slug,
            m.title AS module_title,
            hs.file_r2_key, hs.content_type, hs.size_bytes,
            hs.uploaded_at, hs.is_late, hs.student_comment,
            hs.status, hs.priority,
            hs.reviewed_at, hs.reviewed_by,
            u.name AS reviewer_name,
            hs.instructor_comment,
            hs.instructor_annotation_r2_key, hs.instructor_annotation_uploaded_at,
            ${SUPERSEDED_SQL}
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
       LEFT JOIN modules m ON m.slug = hs.module_slug AND m.locale = ?
       LEFT JOIN users u ON u.id = hs.reviewed_by
      WHERE hs.id = ? AND e.user_id = ? AND e.archived_at IS NULL
      LIMIT 1`,
  )
    .bind(locale, submissionId, userId)
    .first<RawSubmissionRow>();

  if (!row) return null;
  return normalizeRow(row, locale);
}

/**
 * Check submission ownership + return file_r2_key + annotation_r2_key
 * для signed URL generation. ACL: own submission ИЛИ lead instructor ИЛИ admin.
 *
 * Lightweight (без JOIN на modules / users).
 */
export interface SubmissionAclResult {
  submission_id: string;
  enrollment_id: string;
  file_r2_key: string;
  instructor_annotation_r2_key: string | null;
}

export async function getSubmissionForAcl(
  env: Cloudflare.Env,
  submissionId: string,
  userId: string,
  isAdmin: boolean,
): Promise<SubmissionAclResult | null> {
  const row = await env.DB.prepare(
    `SELECT hs.id AS submission_id,
            hs.enrollment_id,
            hs.file_r2_key,
            hs.instructor_annotation_r2_key,
            e.user_id AS student_id,
            e.lead_instructor_id,
            e.archived_at
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
      WHERE hs.id = ?
      LIMIT 1`,
  )
    .bind(submissionId)
    .first<{
      submission_id: string;
      enrollment_id: string;
      file_r2_key: string;
      instructor_annotation_r2_key: string | null;
      student_id: string;
      lead_instructor_id: string | null;
      archived_at: number | null;
    }>();

  if (!row) return null;
  if (row.archived_at != null) return null; // archived enrollment — no access

  const isOwner = row.student_id === userId;
  const isLeadInstructor = row.lead_instructor_id === userId;
  if (!isOwner && !isLeadInstructor && !isAdmin) return null;

  return {
    submission_id: row.submission_id,
    enrollment_id: row.enrollment_id,
    file_r2_key: row.file_r2_key,
    instructor_annotation_r2_key: row.instructor_annotation_r2_key,
  };
}

// ============================================================
// Create (finalize endpoint)
// ============================================================

export interface CreateSubmissionParams {
  submissionId: string;
  enrollmentId: string;
  moduleSlug: string;
  idempotencyKey: string;
  fileR2Key: string;
  contentType: string;
  sizeBytes: number;
  studentComment?: string;
}

export interface CreateSubmissionResult {
  /** Submission ID (new или existing если idempotency hit). */
  id: string;
  /** True если этим вызовом создали row (false = idempotent retry). */
  created: boolean;
}

/**
 * Create homework_submission row.
 *
 * Computes:
 *   - is_late: uploaded_at > next_session.scheduled_at?
 *   - priority: 'low' если module already done (см. Q2.C review), иначе 'normal'
 *
 * Idempotent: повторный вызов с same idempotencyKey возвращает existing
 * submission_id без INSERT.
 */
export async function createSubmission(
  env: Cloudflare.Env,
  params: CreateSubmissionParams,
): Promise<CreateSubmissionResult> {
  const now = Math.floor(Date.now() / 1000);

  // Idempotency check
  const existing = await env.DB.prepare(
    `SELECT id FROM homework_submissions
      WHERE enrollment_id = ? AND idempotency_key = ?
      LIMIT 1`,
  )
    .bind(params.enrollmentId, params.idempotencyKey)
    .first<{ id: string }>();

  if (existing) {
    return { id: existing.id, created: false };
  }

  // Compute is_late (next_session.scheduled_at для module's next session)
  const nextSession = await env.DB.prepare(
    `SELECT MIN(s.scheduled_at) AS next_at
       FROM sessions s
       JOIN enrollments e ON e.id = ?
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
             AND module_slug = ?
        )`,
  )
    .bind(params.enrollmentId, params.moduleSlug)
    .first<{ next_at: number | null }>();

  const isLate = nextSession?.next_at != null && now > nextSession.next_at ? 1 : 0;

  // Compute priority: 'low' если module already done
  const doneCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM homework_submissions
      WHERE enrollment_id = ? AND module_slug = ?
        AND status IN ('approved','auto_approved')`,
  )
    .bind(params.enrollmentId, params.moduleSlug)
    .first<{ n: number }>();

  const priority = (doneCount?.n ?? 0) > 0 ? 'low' : 'normal';

  await env.DB.prepare(
    `INSERT INTO homework_submissions
       (id, enrollment_id, module_slug, idempotency_key,
        file_r2_key, content_type, size_bytes, uploaded_at, is_late,
        student_comment, status, priority,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  )
    .bind(
      params.submissionId,
      params.enrollmentId,
      params.moduleSlug,
      params.idempotencyKey,
      params.fileR2Key,
      params.contentType,
      params.sizeBytes,
      now,
      isLate,
      params.studentComment ?? null,
      priority,
      now,
      now,
    )
    .run();

  return { id: params.submissionId, created: true };
}

// ============================================================
// Last seen (in-app badge tracking)
// ============================================================

/**
 * Update enrollments.homework_last_seen_at = now для всех active
 * enrollments user'а. Используется при заходе на /dashboard/homework.
 */
export async function updateHomeworkLastSeen(
  env: Cloudflare.Env,
  userId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE enrollments SET homework_last_seen_at = ?
      WHERE user_id = ? AND status IN ('active','completed') AND archived_at IS NULL`,
  )
    .bind(now, userId)
    .run();
}

/**
 * Count submissions с reviewed_at > homework_last_seen_at для всех
 * active enrollments user'а. Для navbar badge.
 */
export async function countUnreadFeedback(
  env: Cloudflare.Env,
  userId: string,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
      WHERE e.user_id = ?
        AND e.archived_at IS NULL
        AND hs.reviewed_at IS NOT NULL
        AND hs.reviewed_at > COALESCE(e.homework_last_seen_at, 0)`,
  )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ============================================================
// Upload validation
// ============================================================

/** Whitelist mime-types для homework upload (Q2a). */
export const HOMEWORK_ALLOWED_MIME = new Set<string>([
  // images
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  // text
  'text/plain',
  // MS Office
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',          // xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',    // docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',  // pptx
  // OpenDocument
  'application/vnd.oasis.opendocument.text',          // odt
  'application/vnd.oasis.opendocument.spreadsheet',   // ods
  'application/vnd.oasis.opendocument.presentation',  // odp
  // PDF
  'application/pdf',
  // Video
  'video/mp4', 'video/quicktime', 'video/webm',
]);

/** Получить расширение файла по mime-type (для R2 key). */
export function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'text/plain': 'txt',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.oasis.opendocument.text': 'odt',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods',
    'application/vnd.oasis.opendocument.presentation': 'odp',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return map[mime] ?? 'bin';
}
