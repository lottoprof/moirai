-- Migration: 0007_module_lessons_external_video.sql
-- Date:      2026-05-19
-- Spec:      decisions_archive.md 2026-05-19 §module-metadata,
--            docs/methodist-modules-guide.md
-- Rollback:  (dev only)
--              ALTER TABLE modules RENAME COLUMN default_lessons TO default_duration_days;
--              ALTER TABLE modules DROP COLUMN has_external_video;
--              ALTER TABLE modules DROP COLUMN summary;
--              ALTER TABLE modules DROP COLUMN objectives_json;
--              ALTER TABLE modules DROP COLUMN concepts_json;
--              ALTER TABLE modules DROP COLUMN homework_md;
--              ALTER TABLE modules DROP COLUMN suggested_programme;
--              ALTER TABLE modules DROP COLUMN suggested_order;
--
-- Содержание:
--
-- 1. Переименовать `default_duration_days` → `default_lessons`.
--    Семантика: количество занятий на модуль (не дней). Длительность
--    одного занятия не фиксируется (~20-45 мин гибко). Default 1
--    (большинство теоретических модулей).
--
-- 2. Добавить `has_external_video INTEGER NOT NULL DEFAULT 0` — boolean
--    для YouTube/Vimeo ссылок. Subset has_video. См. methodist guide.
--
-- 3. Добавить дополнительные мета-колонки которые методист задаёт в
--    yaml frontmatter (denormalized cache для list-views — programme
--    page, dashboard module-card, instructor compose):
--      `summary TEXT` — 1-2 sentence description
--      `objectives_json TEXT NOT NULL DEFAULT '[]'` — learning objectives
--      `concepts_json TEXT NOT NULL DEFAULT '[]'` — ключевые термины
--      `homework_md TEXT` — описание ДЗ (markdown). Пусто если
--        has_homework=0
--      `suggested_programme TEXT` — hint от методиста для admin UI
--      `suggested_order INTEGER` — hint порядка в suggested_programme
--
-- Все эти поля per-locale (modules PK = slug+locale), значит
-- duplicated между ru-row и en-row для одного slug'a.

PRAGMA foreign_keys = ON;

-- Step 1: rename column
ALTER TABLE modules RENAME COLUMN default_duration_days TO default_lessons;

-- Step 2: add has_external_video
ALTER TABLE modules ADD COLUMN has_external_video INTEGER NOT NULL DEFAULT 0;

-- Step 3: add metadata columns
ALTER TABLE modules ADD COLUMN summary TEXT;
ALTER TABLE modules ADD COLUMN objectives_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE modules ADD COLUMN concepts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE modules ADD COLUMN homework_md TEXT;
ALTER TABLE modules ADD COLUMN suggested_programme TEXT;
ALTER TABLE modules ADD COLUMN suggested_order INTEGER;
