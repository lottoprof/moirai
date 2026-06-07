/*
 * src/lib/server/cron/retention.ts
 *
 * Retention archival cron — Stage F.
 *
 * Trigger: daily 03:00 UTC.
 *
 * Logic: archived_at = now для enrollments past grace window.
 * Atomic D1 batch:
 *   1. INSERT enrollment_stats (aggregate counters)
 *   2. INSERT curriculum_feedback (анонимные instructor comments)
 *   3. UPDATE enrollments SET archived_at
 *   4. DELETE homework_submissions
 * R2 file delete — post-transaction (best effort, orphan cleanup подберёт).
 *
 * Spec: docs/student-lk-v2-spec.md § 6.3 + Q10 review.
 */

import { LK_CONFIG } from '../../config/lk';

interface EnrollmentRow {
  id: string;
  cohort_id: string;
  programme_slug: string;
  completed_at: number | null;
  cancelled_at: number | null;
}

interface SubmissionFiles {
  file_r2_key: string;
  instructor_annotation_r2_key: string | null;
}

export interface RetentionResult {
  archived: number;
  files_deleted: number;
  errors: number;
  duration_ms: number;
}

export async function runRetention(env: Cloudflare.Env): Promise<RetentionResult> {
  const start = Date.now();
  const now = Math.floor(start / 1000);
  const graceSec = LK_CONFIG.retention_grace_days * 86400;

  // Find candidates
  const rows = await env.DB.prepare(
    `SELECT id, cohort_id, programme_slug, completed_at, cancelled_at
       FROM enrollments
      WHERE archived_at IS NULL
        AND (
          (completed_at IS NOT NULL AND ? > completed_at + ?)
          OR
          (cancelled_at IS NOT NULL AND ? > cancelled_at + ?)
          OR
          (gdpr_delete_requested_at IS NOT NULL AND status IN ('completed','cancelled'))
        )
      LIMIT ?`,
  )
    .bind(now, graceSec, now, graceSec, LK_CONFIG.cron_batch_size)
    .all<EnrollmentRow>();

  let archived = 0;
  let filesDeleted = 0;
  let errors = 0;

  for (const enr of rows.results) {
    try {
      // Compute aggregate stats
      const stats = await env.DB.prepare(
        `SELECT
           COUNT(*)                                          AS total,
           SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)        AS approved,
           SUM(CASE WHEN status = 'needs_revision' THEN 1 ELSE 0 END)  AS needs_revision,
           SUM(CASE WHEN status = 'auto_approved' THEN 1 ELSE 0 END)   AS auto_approved,
           SUM(is_late)                                                AS late_count
         FROM homework_submissions WHERE enrollment_id = ?`,
      )
        .bind(enr.id)
        .first<{
          total: number;
          approved: number | null;
          needs_revision: number | null;
          auto_approved: number | null;
          late_count: number | null;
        }>();

      // Find R2 keys для cleanup
      const files = await env.DB.prepare(
        `SELECT file_r2_key, instructor_annotation_r2_key
           FROM homework_submissions WHERE enrollment_id = ?`,
      )
        .bind(enr.id)
        .all<SubmissionFiles>();

      // Atomic batch
      const completed = enr.completed_at ?? enr.cancelled_at ?? now;
      const batch = [
        env.DB.prepare(
          `INSERT INTO enrollment_stats (enrollment_id, cohort_id, programme_slug,
            total_submissions, approved_count, needs_revision_count,
            auto_approved_count, late_count, completed_at, archived_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (enrollment_id) DO NOTHING`,
        ).bind(
          enr.id, enr.cohort_id, enr.programme_slug,
          stats?.total ?? 0,
          stats?.approved ?? 0,
          stats?.needs_revision ?? 0,
          stats?.auto_approved ?? 0,
          stats?.late_count ?? 0,
          completed, now,
        ),
        env.DB.prepare(
          `INSERT INTO curriculum_feedback (id, cohort_id, module_slug,
            instructor_id, homework_status, comment_text, original_at)
           SELECT hex(randomblob(16)), ?, hs.module_slug, hs.reviewed_by,
            hs.status, hs.instructor_comment,
            COALESCE(hs.reviewed_at, hs.uploaded_at)
           FROM homework_submissions hs
           WHERE hs.enrollment_id = ?
             AND hs.instructor_comment IS NOT NULL`,
        ).bind(enr.cohort_id, enr.id),
        env.DB.prepare(
          `UPDATE enrollments SET archived_at = ? WHERE id = ? AND archived_at IS NULL`,
        ).bind(now, enr.id),
        env.DB.prepare(
          `DELETE FROM homework_submissions WHERE enrollment_id = ?`,
        ).bind(enr.id),
      ];

      await env.DB.batch(batch);
      archived++;

      // R2 cleanup (best effort, post-transaction)
      for (const f of files.results) {
        try {
          await env.HOMEWORK_BUCKET.delete(f.file_r2_key);
          filesDeleted++;
          if (f.instructor_annotation_r2_key) {
            await env.HOMEWORK_BUCKET.delete(f.instructor_annotation_r2_key);
            filesDeleted++;
          }
        } catch (err) {
          console.error('[cron/retention] R2 delete failed:', f.file_r2_key, err);
          // orphan cleanup cron will catch
        }
      }
    } catch (err) {
      console.error('[cron/retention] error для enrollment', enr.id, err);
      errors++;
    }
  }

  return { archived, files_deleted: filesDeleted, errors, duration_ms: Date.now() - start };
}
