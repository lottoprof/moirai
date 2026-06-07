-- Migration: 0014_homework_submissions.sql
-- Date:      2026-06-07
-- Spec:      docs/student-lk-v2-spec.md § 2.1 (homework_submissions,
--            enrollment_stats, curriculum_feedback).
-- Stage:     A / M5 (Student LK v2)
-- Rollback:  (dev only)
--              DROP TABLE homework_submissions;
--              DROP TABLE enrollment_stats;
--              DROP TABLE curriculum_feedback;
--
-- Содержание:
--   1. homework_submissions — студенческие сдачи ДЗ + instructor review.
--      Status: pending | needs_revision | approved | auto_approved.
--      LLM колонки зарезервированы (future).
--   2. enrollment_stats — aggregate counters, заполняется при retention
--      archival (после DELETE homework_submissions rows).
--   3. curriculum_feedback — анонимные instructor comments,
--      сохраняются для curriculum analysis после retention.
--      БЕЗ user_id / enrollment_id / submission_id.
--
-- Связано с:
--   - Student LK v2 Q1 (homework status enum, auto-approve по next session)
--   - Student LK v2 Q2 (resubmit история, annotated copy, comment format)
--   - Student LK v2 Q10 (retention pipeline)

PRAGMA foreign_keys = ON;

-- ============================================================
-- homework_submissions — студенческие сдачи + instructor review
-- ============================================================
-- 1 row per upload (resubmit — отдельная row, не overwrite).
-- file_r2_key path pattern: 'homework/{enrollment_id}/{id}.<ext>'.
--
-- status lifecycle:
--   pending (на upload) → needs_revision | approved (instructor)
--                       → auto_approved (cron, если pending +
--                         uploaded_at < next_session.scheduled_at)
--
-- priority:
--   normal — обычный pending в queue preподa.
--   low    — resubmit после approved (module уже done) → preпод
--            может игнорировать без consequences.
--
-- is_late — set at upload: uploaded_at > next_session.scheduled_at.
-- Не блокирует, просто метка.
--
-- LLM колонки (llm_draft_*) зарезервированы для future (Sprint 2+).
-- В MVP NULL.
--
-- feedback_email_sent_at — idempotency для outbound Resend email.
--
-- idempotency_key — client-generated UUID для retry безопасности
-- finalize endpoint.
CREATE TABLE homework_submissions (
  id                                TEXT PRIMARY KEY,                 -- UUID, used в R2 path
  enrollment_id                     TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  module_slug                       TEXT NOT NULL,                    -- soft FK на modules.slug
  idempotency_key                   TEXT NOT NULL,                    -- client UUID
  -- file
  file_r2_key                       TEXT NOT NULL,                    -- 'homework/{enrollment_id}/{id}.<ext>'
  content_type                      TEXT NOT NULL,                    -- mime
  size_bytes                        INTEGER NOT NULL,
  uploaded_at                       INTEGER NOT NULL,
  is_late                           INTEGER NOT NULL DEFAULT 0,       -- 0/1; computed at finalize
  -- student
  student_comment                   TEXT,                             -- markdown, ≤ 2000 chars
  -- status
  status                            TEXT NOT NULL DEFAULT 'pending'
                                    CHECK(status IN ('pending','needs_revision','approved','auto_approved')),
  priority                          TEXT NOT NULL DEFAULT 'normal'
                                    CHECK(priority IN ('normal','low')),
  -- LLM pre-check (future, columns reserved)
  llm_draft_status                  TEXT
                                    CHECK(llm_draft_status IS NULL OR llm_draft_status IN ('approved','needs_revision')),
  llm_draft_comment                 TEXT,
  llm_checked_at                    INTEGER,
  -- instructor
  reviewed_by                       TEXT REFERENCES users(id),
  reviewed_at                       INTEGER,
  instructor_comment                TEXT,                             -- markdown, ≤ 10000 chars
  instructor_annotation_r2_key      TEXT,                             -- nullable, optional annotated copy
  instructor_annotation_uploaded_at INTEGER,
  -- notification state
  feedback_email_sent_at            INTEGER,                          -- idempotency для Resend
  created_at                        INTEGER NOT NULL,
  updated_at                        INTEGER NOT NULL,
  UNIQUE (enrollment_id, idempotency_key)
);

CREATE INDEX idx_homework_enrollment_module
  ON homework_submissions(enrollment_id, module_slug);

CREATE INDEX idx_homework_status
  ON homework_submissions(status);

-- Filtered index — queue preподa pending normal-priority
CREATE INDEX idx_homework_pending_priority
  ON homework_submissions(status, priority, uploaded_at)
  WHERE status = 'pending';

CREATE INDEX idx_homework_reviewed_by_week
  ON homework_submissions(reviewed_by, reviewed_at)
  WHERE reviewed_at IS NOT NULL;

-- updated_at auto-touch trigger
CREATE TRIGGER trg_homework_submissions_updated_at
  AFTER UPDATE ON homework_submissions
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE homework_submissions
    SET updated_at = unixepoch()
    WHERE id = NEW.id;
END;

-- ============================================================
-- enrollment_stats — aggregate после retention
-- ============================================================
-- Заполняется в момент archival (retention cron). БЕЗ PII —
-- только counters. enrollment_id остаётся как FK на soft-archived
-- enrollment row (которая сама теряет homework files и rows).
CREATE TABLE enrollment_stats (
  enrollment_id          TEXT PRIMARY KEY,
  cohort_id              TEXT NOT NULL,
  programme_slug         TEXT NOT NULL,
  total_submissions      INTEGER NOT NULL,
  approved_count         INTEGER NOT NULL,
  needs_revision_count   INTEGER NOT NULL,
  auto_approved_count    INTEGER NOT NULL,
  late_count             INTEGER NOT NULL,
  completed_at           INTEGER NOT NULL,
  archived_at            INTEGER NOT NULL
);

CREATE INDEX idx_enrollment_stats_cohort ON enrollment_stats(cohort_id);

-- ============================================================
-- curriculum_feedback — анонимные comments
-- ============================================================
-- Сохраняется при retention archival для curriculum analysis.
-- БЕЗ user_id / enrollment_id / submission_id (анонимизация).
-- cohort_id остаётся (per lottoprof) — это context, не PII.
-- instructor_id — staff, не PII студента.
CREATE TABLE curriculum_feedback (
  id                TEXT PRIMARY KEY,
  cohort_id         TEXT NOT NULL,                                    -- сохраняется
  module_slug       TEXT NOT NULL,
  instructor_id     TEXT REFERENCES users(id),                        -- staff
  homework_status   TEXT NOT NULL
                    CHECK(homework_status IN ('approved','needs_revision','auto_approved')),
  comment_text      TEXT NOT NULL,
  original_at       INTEGER NOT NULL                                  -- когда коммент был оставлен
);

CREATE INDEX idx_curriculum_feedback_module ON curriculum_feedback(module_slug);
CREATE INDEX idx_curriculum_feedback_cohort ON curriculum_feedback(cohort_id);

-- ============================================================
-- Notes
-- ============================================================
--
-- 1. homework_submissions FK ON enrollments cascade DELETE — но в
--    retention pipeline мы DELETE submissions ВРУЧНУЮ в transaction
--    BEFORE удаления enrollment (которое не делаем — enrollment
--    soft archived через archived_at). FK cascade — safety net на
--    случай manual admin delete.
--
-- 2. module_slug — БЕЗ FK на modules (modules могут archive в
--    external repo, soft-validation в коде).
--
-- 3. UNIQUE (enrollment_id, idempotency_key) — для retry safety
--    finalize endpoint. Client sends same key on retry → existing
--    row found → return its id, no duplicate row created.
--
-- 4. file_r2_key NULL — невозможно (NOT NULL). Если R2 PUT failed
--    до finalize — row не создаётся, R2 orphan cleanup cron подберёт.
--
-- 5. priority filtered index — оптимизирует main instructor queue
--    query (WHERE status='pending' AND priority='normal').
--
-- 6. enrollment_stats не имеет FK на cohorts/users — cohort может
--    быть archived/удалён в future, но stats остаются для analytics.
--
-- 7. curriculum_feedback.instructor_id FK на users — instructor
--    soft-deleted (users.deleted_at) сохраняет referenced row. Если
--    hard delete instructor когда-нибудь — pre-clear FK на NULL
--    (ON DELETE SET NULL — но D1 SQLite не поддерживает изменение
--    FK без recreate table; реализуем в коде).
