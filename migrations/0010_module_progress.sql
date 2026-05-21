-- Migration: 0010_module_progress.sql
-- Date:      2026-05-21
-- Spec:      Stage 26 (Student ЛК).
-- Rollback:  (dev only) DROP TABLE module_progress;
--
-- Stage 26a — progress tracking для модулей внутри enrollment.
--
-- 1 row per (enrollment_id, module_slug). Locale хранится для контекста
-- (нужно когда показываем body на странице модуля), но прогресс
-- ОБЩИЙ для slug — клиент учился в RU не учится в EN заново.
--
-- Lifecycle:
--   not_started → in_progress → done
--
-- `in_progress` устанавливается автоматически при первом open страницы
-- модуля (server-side, в GET handler'е). `done` — explicit от user'a
-- через "Mark complete" CTA.
--
-- `completed_at` фиксируется при переходе в `done` (для analytics
-- "сколько по времени студент проходит модуль" — Sprint 2+).

PRAGMA foreign_keys = ON;

CREATE TABLE module_progress (
  enrollment_id   TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  module_slug     TEXT NOT NULL,
  locale          TEXT NOT NULL
                  CHECK(locale IN ('en','ru')),
  status          TEXT NOT NULL DEFAULT 'not_started'
                  CHECK(status IN ('not_started','in_progress','done')),
  last_seen_at    INTEGER,                                          -- timestamp последнего open
  completed_at    INTEGER,                                          -- timestamp перехода в done
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (enrollment_id, module_slug)
);

CREATE INDEX idx_module_progress_enrollment ON module_progress(enrollment_id);
CREATE INDEX idx_module_progress_status     ON module_progress(enrollment_id, status);

-- updated_at auto-touch trigger
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
-- 1. module_slug ссылается на modules.slug (БЕЗ FK — модули могут
--    archived в external content repo; soft-validation в коде).
--
-- 2. PK (enrollment_id, module_slug) гарантирует один row per
--    enrollment × module. Если студент в RU поменяет на EN — UPDATE
--    locale, не INSERT новый row.
--
-- 3. При INSERT enrollment в processCheckoutSuccess (Stage 14m) — мы
--    НЕ создаём заранее module_progress rows для всех модулей. Они
--    создаются lazy при первом GET страницы модуля (status='in_progress').
--    Это упрощает schema-evolution: если методист добавит модуль в
--    programme — student просто увидит его новым, без migration data.
--
-- 4. Sequential unlock: helper `isModuleUnlocked(env, enrollmentId, slug)`
--    проверяет что все модули с order_idx < target.order_idx имеют
--    status='done'. Sprint 2+ можно сделать through `requires_modules_json`
--    explicit deps вместо order.
