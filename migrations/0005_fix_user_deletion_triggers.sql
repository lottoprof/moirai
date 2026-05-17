-- Migration: 0005_fix_user_deletion_triggers.sql
-- Date:      2026-05-17
-- Spec:      .agent/rules/decisions_archive.md 2026-05-17 §triggers
-- Rollback:  (dev only) re-apply 0003 triggers without EXISTS guard.
--
-- Bug: триггеры prevent_role_orphan и prevent_last_admin_demotion из 0003
-- блокировали cascade-delete user'a:
--   DELETE FROM users WHERE id=X
--   → SQLite cascades user_roles DELETEs
--   → AFTER DELETE trigger срабатывал для каждой строки
--   → видел "0 ролей у user'a" / "0 admin'ов" → ABORT
--   → cascade весь rollback'ался → user не удалялся
--
-- Fix: добавить `EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)`
-- в WHEN-clause. SQLite cascade удаляет родителя users перед FK-cascade
-- на user_roles → к моменту срабатывания триггера user уже отсутствует
-- → trigger skip'ает. Manual DELETE из user_roles (без user.delete) —
-- работает как раньше: trigger fires если user ещё существует.
--
-- Сценарии валидации:
--   1. DELETE из user_roles когда user активный + есть другие admin'ы:
--      → trigger пропускает (есть другой admin) ✓
--   2. DELETE последней admin-роли у активного user'a:
--      → trigger ABORT (защита last-admin) ✓
--   3. DELETE last role у активного user'a (orphan check):
--      → trigger ABORT (защита от orphan) ✓
--   4. DELETE FROM users (cascade user_roles):
--      → user уже удалён → EXISTS=false → trigger пропускает ✓
--
-- Не входит: user_roles.granted_by FK clause. SQLite не позволяет
-- ALTER TABLE для изменения ON DELETE clause. Code-side helper
-- `deleteUser` в user-ops.ts NULL'ит granted_by перед DELETE users.

PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS prevent_role_orphan;
DROP TRIGGER IF EXISTS prevent_last_admin_demotion;

CREATE TRIGGER prevent_role_orphan
  AFTER DELETE ON user_roles
  WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
   AND (SELECT COUNT(*) FROM user_roles WHERE user_id = OLD.user_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'user must have at least one role');
END;

CREATE TRIGGER prevent_last_admin_demotion
  AFTER DELETE ON user_roles
  WHEN OLD.role = 'admin'
   AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
   AND NOT EXISTS (
     SELECT 1 FROM user_roles ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.role = 'admin' AND u.deactivated_at IS NULL
   )
BEGIN
  SELECT RAISE(ABORT, 'at least one active admin must exist');
END;
