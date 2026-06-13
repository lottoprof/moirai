-- Migration: 0020_module_progress_check_fix.sql
-- Date:      2026-06-13
-- Spec:      Bug fix — migration 0016 переименовала status → view_status,
--            но CHECK constraint остался на старых значениях
--            ('not_started','in_progress','done'). INSERT с view_status='viewed'
--            (как делает markModuleViewed) валится на CHECK constraint failed.
--
--            Воспроизводилось: test-student перешёл в running beginner cohort
--            с unlocked модулями → GET /dashboard/modules/[slug] → 500.
--
-- Содержание:
--   Recreate module_progress с правильным CHECK на view_status.
--   Допустимые значения: 'not_started', 'viewed'.
--   (Старые 'in_progress' / 'done' уже UPDATE'нуты в 'viewed' миграцией 0016.)
--
-- Pattern: standard SQLite paradigm CREATE NEW → COPY → DROP → RENAME
-- (как и предсказала миграция 0016 в Notes).

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. New table с правильным CHECK
-- ============================================================
CREATE TABLE module_progress_new (
  enrollment_id   TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  module_slug     TEXT NOT NULL,
  locale          TEXT NOT NULL
                  CHECK(locale IN ('en','ru')),
  view_status     TEXT NOT NULL DEFAULT 'not_started'
                  CHECK(view_status IN ('not_started','viewed')),
  last_seen_at    INTEGER,
  completed_at    INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (enrollment_id, module_slug)
);

-- ============================================================
-- 2. Copy data
-- ============================================================
INSERT INTO module_progress_new
  (enrollment_id, module_slug, locale, view_status,
   last_seen_at, completed_at, created_at, updated_at)
SELECT enrollment_id, module_slug, locale,
       CASE WHEN view_status = 'not_started' THEN 'not_started' ELSE 'viewed' END,
       last_seen_at, completed_at, created_at, updated_at
  FROM module_progress;

-- ============================================================
-- 3. Drop old + rename
-- ============================================================
DROP TABLE module_progress;
ALTER TABLE module_progress_new RENAME TO module_progress;

-- ============================================================
-- 4. Recreate indexes + trigger (DROP TABLE удалил их)
-- ============================================================
CREATE INDEX idx_module_progress_enrollment ON module_progress(enrollment_id);
CREATE INDEX idx_module_progress_status     ON module_progress(enrollment_id, view_status);

CREATE TRIGGER trg_module_progress_updated_at
  AFTER UPDATE ON module_progress
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE module_progress
    SET updated_at = unixepoch()
    WHERE enrollment_id = NEW.enrollment_id
      AND module_slug = NEW.module_slug;
END;

-- ============================================================
-- Notes
-- ============================================================
--
-- 1. Если на module_progress был UNIQUE / index / trigger — нужно
--    пересоздать. Проверка перед prod-apply:
--      SELECT name, sql FROM sqlite_master
--       WHERE tbl_name = 'module_progress' AND type IN ('index','trigger');
--    На момент 2026-06-13 на module_progress нет дополнительных
--    индексов/триггеров (только implicit от PRIMARY KEY).
--
-- 2. После apply — markModuleViewed (см. src/lib/server/student-modules.ts:268)
--    должен работать без CHECK constraint failure.
