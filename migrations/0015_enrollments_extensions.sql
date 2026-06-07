-- Migration: 0015_enrollments_extensions.sql
-- Date:      2026-06-07
-- Spec:      docs/student-lk-v2-spec.md § 2.2 (enrollments, users,
--            enrollment_modules extensions).
-- Stage:     A / M6 (Student LK v2)
-- Rollback:  (dev only)
--              ALTER TABLE enrollments DROP COLUMN archived_at;
--              ALTER TABLE enrollments DROP COLUMN gdpr_delete_requested_at;
--              ALTER TABLE enrollments DROP COLUMN pre_archive_email_sent_at;
--              ALTER TABLE enrollments DROP COLUMN homework_last_seen_at;
--              ALTER TABLE enrollment_modules DROP COLUMN unlock_override_at;
--              ALTER TABLE enrollment_modules DROP COLUMN unlock_override_by;
--              ALTER TABLE enrollment_modules DROP COLUMN unlock_override_reason;
--              ALTER TABLE users DROP COLUMN deleted_at;
--              ALTER TABLE users DROP COLUMN notifications_email;
--
-- Содержание расширения существующих таблиц для:
--   1. Q1 review (instructor override unlock) — 3 колонки в enrollment_modules.
--   2. Q1.E review (archived_at + cancelled_at для retention).
--   3. Q10 (GDPR delete flow) — gdpr_delete_requested_at в enrollments.
--   4. Q10 (retention email warning) — pre_archive_email_sent_at.
--   5. Q2f (in-app badge computation) — homework_last_seen_at.
--   6. Q10.C (GDPR user soft-delete) — users.deleted_at.
--   7. Q2f (email opt-out) — users.notifications_email.

PRAGMA foreign_keys = ON;

-- ============================================================
-- enrollments — retention + GDPR + notification state
-- ============================================================
-- Note: cancelled_at УЖЕ существует с migration 0004 — не дублируем.
-- Retention trigger использует MIN(completed_at, cancelled_at) + 30 days.
--
-- archived_at — set retention cron'ом или manual GDPR delete.
-- После archived — module pages, homework download — все 404.
-- См. ACL § 3 в spec.
--
-- gdpr_delete_requested_at — flag для on_completion mode (LK_CONFIG
-- default). Студент остаётся в cohort'е, но при completion → skip
-- 30-day grace, archive immediately.
--
-- pre_archive_email_sent_at — idempotency для 7-day warning email.
--
-- homework_last_seen_at — timestamp последнего открытия
-- /dashboard/homework. Используется для in-app badge: новые
-- review с reviewed_at > homework_last_seen_at.
ALTER TABLE enrollments ADD COLUMN archived_at               INTEGER;
ALTER TABLE enrollments ADD COLUMN gdpr_delete_requested_at  INTEGER;
ALTER TABLE enrollments ADD COLUMN pre_archive_email_sent_at INTEGER;
ALTER TABLE enrollments ADD COLUMN homework_last_seen_at     INTEGER;

-- Index для retention cron (find enrollments past grace window)
CREATE INDEX idx_enrollments_archival_candidates
  ON enrollments(archived_at, completed_at, cancelled_at)
  WHERE archived_at IS NULL;

-- Index для pre-archive email cron
CREATE INDEX idx_enrollments_pre_archive_email
  ON enrollments(pre_archive_email_sent_at, completed_at, cancelled_at)
  WHERE archived_at IS NULL
    AND pre_archive_email_sent_at IS NULL;

-- ============================================================
-- enrollment_modules — instructor override unlock
-- ============================================================
-- unlock_override_at — если NOT NULL, модуль unlocked независимо
-- от schedule. Set при explicit instructor action через UI.
--
-- unlock_override_by — instructor user_id для audit.
-- unlock_override_reason — короткий текст для audit (optional).
--
-- Undo: SET unlock_override_at = NULL (DELETE override endpoint
-- в § 4.3 spec).
ALTER TABLE enrollment_modules ADD COLUMN unlock_override_at      INTEGER;
ALTER TABLE enrollment_modules ADD COLUMN unlock_override_by      TEXT REFERENCES users(id);
ALTER TABLE enrollment_modules ADD COLUMN unlock_override_reason  TEXT;

-- ============================================================
-- users — GDPR soft-delete + notification opt-out
-- ============================================================
-- deleted_at — set при GDPR delete или admin hard delete.
-- При soft-delete: email/password_hash → NULL, auth_methods DELETE,
-- sessions revoke. User не может login. FK references сохраняются.
--
-- notifications_email — 0/1 toggle. Default ON (1). UI в /account.
-- При opt-out — Resend skip'ит outbound email на student events.
ALTER TABLE users ADD COLUMN deleted_at          INTEGER;
ALTER TABLE users ADD COLUMN notifications_email INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- Notes
-- ============================================================
--
-- 1. enrollment_modules.unlock_override_by FK на users — instructor
--    soft-deleted сохраняет referenced row. Если instructor hard
--    deleted в future — pre-clear FK на NULL (реализуем в коде).
--
-- 2. users.notifications_email INTEGER (0/1) вместо BOOLEAN —
--    SQLite не имеет real BOOLEAN type, integer работает идиоматично.
--
-- 3. archived_at column добавляется с NULL для всех existing rows.
--    Retention cron подбирает с условием WHERE archived_at IS NULL
--    AND (completed_at + 30 days < now OR cancelled_at + 30 days < now).
--    Existing completed enrollments старше 30 дней попадут в archival
--    при первом cron run после deploy. Это **намеренное** поведение —
--    retention применяется ретроактивно. Если нежелательно — admin
--    может вручную SET archived_at = unixepoch() для существующих
--    completed которые не хотим archive.
--
-- 4. Будущая extension `archived_at` filtered index можно добавить
--    в M7+ если query plan покажет необходимость.
