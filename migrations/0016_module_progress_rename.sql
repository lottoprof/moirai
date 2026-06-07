-- Migration: 0016_module_progress_rename.sql
-- Date:      2026-06-07
-- Spec:      docs/student-lk-v2-spec.md § 2.2 (module_progress).
-- Stage:     A / M7 (Student LK v2)
-- Rollback:  (dev only)
--              ALTER TABLE module_progress RENAME COLUMN view_status TO status;
--              UPDATE module_progress SET status = 'in_progress'
--                WHERE status = 'viewed';
--
-- Содержание:
--   Семантическое переименование module_progress.status → view_status.
--   После Q1 student v2 — completion модуля больше не определяется
--   через module_progress. Теперь:
--     - Теоретический модуль done = auto через session.scheduled_at + 1h
--     - Практический модуль done = approved/auto_approved homework_submission
--   Mark complete у студента убран.
--
--   module_progress остаётся как audit "когда первый раз открыл",
--   ставит view_status = 'viewed' при первом GET страницы.
--
-- Связано с:
--   - Student LK v2 Q1 (две независимые оси: unlock + completion)
--   - Stage B удаление markModuleComplete helper'a + complete endpoint

PRAGMA foreign_keys = ON;

-- ============================================================
-- module_progress — rename status → view_status
-- ============================================================
-- D1 SQLite 3.45+ поддерживает ALTER TABLE RENAME COLUMN.
-- Existing values:
--   'not_started' → остаётся 'not_started' (или просто отсутствует row)
--   'in_progress' → переписываем в 'viewed'
--   'done'        → переписываем в 'viewed' (больше не source of truth)

ALTER TABLE module_progress RENAME COLUMN status TO view_status;

-- Normalize existing values
UPDATE module_progress
   SET view_status = 'viewed'
 WHERE view_status IN ('done', 'in_progress');

-- ============================================================
-- Notes
-- ============================================================
--
-- 1. CHECK constraint на старой колонке (status IN ('not_started',
--    'in_progress','done')) — D1 не позволяет легко добавить новый
--    CHECK без recreate table. После RENAME COLUMN check всё ещё
--    относится к старому имени? Зависит от SQLite version.
--    Если test показывает что check блокирует UPDATE 'viewed' —
--    дополнительная миграция через CREATE NEW TABLE + COPY + DROP +
--    RENAME (стандартный SQLite paradigm).
--
-- 2. Helper `markModuleOpened` в src/lib/server/student-modules.ts
--    обновляется (Stage B): SET view_status = 'viewed' INSTEAD of
--    'in_progress'. Не перетирает existing 'viewed'.
--
-- 3. Trigger updated_at — остаётся (column name change не ломает
--    trigger logic, он ссылается на NEW.updated_at).
