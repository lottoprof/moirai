-- Migration: 0011_sessions.sql
-- Date:      2026-06-07
-- Spec:      docs/student-lk-v2-spec.md § 2.1 (sessions), § 2.2 (cohorts).
-- Stage:     A / M1 (Student LK v2)
-- Rollback:  (dev only)
--              DROP TABLE sessions;
--              ALTER TABLE cohorts DROP COLUMN meeting_provider;
--              ALTER TABLE cohorts DROP COLUMN meeting_url;
--              ALTER TABLE cohorts DROP COLUMN meeting_host_url;
--              ALTER TABLE cohorts DROP COLUMN modules_snapshot_json;
--
-- Содержание:
--   1. sessions       — расписание live-sessions per cohort (1:1 module mapping)
--   2. cohorts.*      — meeting URL fields (Zoom/Teams/Google Meet) +
--                       modules_snapshot_json (snapshot programme.default_modules)
--
-- Связано с:
--   - Student LK v2 Q1 (unlock = now >= session.scheduled_at − unlock_lead_hours)
--   - Student LK v2 Q4 (sessions auto-generate при cohort creation)

PRAGMA foreign_keys = ON;

-- ============================================================
-- sessions — расписание live-sessions per cohort
-- ============================================================
-- 1:1 mapping module_slug ↔ session (Q4f). N:N через junction
-- table не делаем в MVP.
--
-- scheduled_at — UTC unix (хранение в UTC, display конвертируется
-- через Intl.DateTimeFormat browser-side, plus ET для preподa).
-- DST конверсия делается per-session при auto-generation
-- (scripts/lib/compute-session-dates.mjs).
--
-- meeting_url / meeting_host_url — opt overrides; NULL → берётся
-- cohort.meeting_url / cohort.meeting_host_url (persistent meeting).
--
-- status lifecycle:
--   scheduled → passed (auto cron при now > scheduled_at)
--   scheduled → cancelled (admin action)
--   scheduled → rescheduled (admin action — updated scheduled_at)
--
-- notes — admin/instructor internal (TBA, не показывается студентам).
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,                          -- UUID
  cohort_id           TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  module_slug         TEXT NOT NULL,                             -- ссылка на modules.slug (БЕЗ FK, soft)
  order_idx           INTEGER NOT NULL,                          -- порядок внутри cohort
  scheduled_at        INTEGER NOT NULL,                          -- UTC unix seconds
  meeting_url         TEXT,                                      -- join URL override
  meeting_host_url    TEXT,                                      -- host URL override
  status              TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK(status IN ('scheduled','passed','cancelled','rescheduled')),
  notes               TEXT,                                      -- admin/instructor internal
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  UNIQUE (cohort_id, module_slug)                                -- 1:1 — один session per module per cohort
);

CREATE INDEX idx_sessions_cohort_order ON sessions(cohort_id, order_idx);
CREATE INDEX idx_sessions_scheduled    ON sessions(scheduled_at);
CREATE INDEX idx_sessions_status_scheduled
  ON sessions(status, scheduled_at);

-- updated_at auto-touch trigger
CREATE TRIGGER trg_sessions_updated_at
  AFTER UPDATE ON sessions
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE sessions
    SET updated_at = unixepoch()
    WHERE id = NEW.id;
END;

-- ============================================================
-- cohorts — meeting URLs + modules snapshot
-- ============================================================
-- meeting_provider диктует label в UI ("Join Zoom" / "Join Teams" /
-- "Join Google Meet"). URL format / validation — opaque (admin
-- responsibility).
--
-- meeting_host_url — для instructor. Zoom разделяет join / host
-- через separate URLs; Teams / Meet тоже. Если NULL — instructor
-- использует meeting_url (Zoom recognise host через login).
--
-- modules_snapshot_json — фиксированный список модулей для этой
-- cohort'ы. Копируется из programme.default_modules при cohort
-- creation. Programme changes НЕ каскадят в active cohorts (§ Q4.A
-- review).
ALTER TABLE cohorts ADD COLUMN meeting_provider TEXT NOT NULL DEFAULT 'zoom'
  CHECK(meeting_provider IN ('zoom','teams','gmeet','other'));
ALTER TABLE cohorts ADD COLUMN meeting_url TEXT;
ALTER TABLE cohorts ADD COLUMN meeting_host_url TEXT;
ALTER TABLE cohorts ADD COLUMN modules_snapshot_json TEXT NOT NULL DEFAULT '[]';

-- ============================================================
-- Notes
-- ============================================================
--
-- 1. UNIQUE (cohort_id, module_slug) гарантирует 1:1 mapping. Если
--    в будущем нужно N:N (session покрывает несколько modules) —
--    мигрируем через junction table session_modules (Future migrations).
--
-- 2. sessions.module_slug ссылается на modules.slug БЕЗ FK
--    (causality: modules могут archive в external repo, soft-validation
--    в коде).
--
-- 3. cohorts.modules_snapshot_json — пустой `'[]'` default для
--    existing cohorts. Backfill через scripts/backfill-cohort-modules-snapshot.mjs
--    (M8 в Stage A).
--
-- 4. Existing cohorts получают sessions через scripts/backfill-sessions.mjs
--    (M9 в Stage A) — auto-generate на основании modules_snapshot_json +
--    cohort_slots days/time.
