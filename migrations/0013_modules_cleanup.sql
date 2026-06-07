-- Migration: 0013_modules_cleanup.sql
-- Date:      2026-06-07
-- Spec:      docs/student-lk-v2-spec.md § 2.2 + § 9 M4.
-- Stage:     A / M4 (Student LK v2)
-- Rollback:  (dev only)
--              ALTER TABLE modules ADD COLUMN body_r2_key TEXT;
--              ALTER TABLE modules ADD COLUMN homework_md TEXT;
--              -- restore data from backup (export перед M4)
--
-- ВАЖНО: ПРИМЕНЯТЬ ТОЛЬКО ПОСЛЕ:
--   1. M3 script (migrate-modules-bodies.mjs) success на target environment.
--   2. Verify pnpm check:r2-d1 — все workbook keys присутствуют в R2.
--   3. Verify SELECT COUNT(*) FROM modules WHERE workbook_r2_key IS NULL = 0.
--
-- Содержание:
--   DROP modules.body_r2_key + modules.homework_md.
--   Колонки stage22 / stage26 — replaced by workbook_r2_key + содержанием
--   workbook (## Домашнее задание секция).
--
-- Связано с:
--   - Student LK v2 Q3 (workbook = body, homework описание в workbook'е)

PRAGMA foreign_keys = ON;

-- ============================================================
-- modules — drop replaced columns
-- ============================================================
-- D1 (SQLite 3.45+) поддерживает DROP COLUMN. После этого:
--   - modules.body_r2_key — больше нет, код использует workbook_r2_key.
--   - modules.homework_md — больше нет, описание ДЗ в workbook (секция).
ALTER TABLE modules DROP COLUMN body_r2_key;
ALTER TABLE modules DROP COLUMN homework_md;

-- ============================================================
-- Notes
-- ============================================================
--
-- 1. После M4 — все код paths должны использовать workbook_r2_key.
--    Если где-то остался reference на body_r2_key — runtime error
--    "no such column". Поэтому M4 применяется ВМЕСТЕ с code update
--    (Stage B / C где UI читает новые поля).
--
-- 2. Existing code (stage26 student dashboard / module page) читает
--    body_r2_key. Перед M4 в production надо deploy code update.
--    Локально — обновляем код параллельно с миграциями.
--
-- 3. Backup перед M4 в production:
--      pnpm wrangler d1 export moirai-prod --output=backup-pre-M4-$(date +%F).sql
--    Чтобы можно было restore homework_md если что-то пошло не так.
