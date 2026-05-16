-- Migration: 0003_user_roles_deactivation.sql
-- Date:      2026-05-17
-- Spec:      docs/Architecture.md §3 (role-zones), decisions_archive.md 2026-05-17
-- Rollback:  (dev only) DROP TRIGGER prevent_last_admin_demotion;
--                       DROP TRIGGER prevent_role_orphan;
--                       DROP TABLE user_roles;
--                       ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','instructor','admin'));
--                       ALTER TABLE users DROP COLUMN deactivated_at;
--
-- Содержание:
--   1. Add users.deactivated_at — soft-deactivation (Architecture.md §3 role-zones)
--   2. Create user_roles — M2M user × role (admin может одновременно преподавать)
--   3. Backfill user_roles из users.role
--   4. Drop users.role (single-role concept отменён в пользу M2M)
--   5. Triggers: prevent_role_orphan (≥1 role per user),
--               prevent_last_admin_demotion (≥1 active admin)
--
-- ВНИМАНИЕ: требует SQLite 3.35+ (поддержка DROP COLUMN). D1 удовлетворяет.

PRAGMA foreign_keys = ON;

-- ============================================================
-- Step 1: users.deactivated_at
-- ============================================================
ALTER TABLE users ADD COLUMN deactivated_at INTEGER;

-- Индекс для periodic queries "all deactivated users"
CREATE INDEX idx_users_deactivated_at ON users(deactivated_at)
  WHERE deactivated_at IS NOT NULL;

-- ============================================================
-- Step 2: user_roles table
-- ============================================================
CREATE TABLE user_roles (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL
              CHECK(role IN ('student','instructor','admin')),
  granted_by  TEXT REFERENCES users(id),           -- NULL для backfill / self-registration
  granted_at  INTEGER NOT NULL,                    -- unix seconds
  PRIMARY KEY (user_id, role)
);

CREATE INDEX idx_user_roles_role ON user_roles(role);

-- ============================================================
-- Step 3: Backfill user_roles from existing users.role
-- ============================================================
INSERT INTO user_roles (user_id, role, granted_by, granted_at)
  SELECT id, role, NULL, created_at
  FROM users;

-- ============================================================
-- Step 4: Drop users.role
-- ============================================================
-- "Primary role" concept удалён — отныне source of truth = user_roles.
-- "Display role" в UI вычисляется через CASE (admin > instructor > student).
ALTER TABLE users DROP COLUMN role;

-- ============================================================
-- Step 5: Safety triggers
-- ============================================================

-- 5a. Не позволяем user'у остаться без ролей вообще.
--     После DELETE строки из user_roles: если у user_id осталось 0 строк → ABORT.
CREATE TRIGGER prevent_role_orphan
  AFTER DELETE ON user_roles
  WHEN (SELECT COUNT(*) FROM user_roles WHERE user_id = OLD.user_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'user must have at least one role');
END;

-- 5b. Last-admin invariant: запрет remove последней admin role
--     если в системе нет другого active admin'a.
--     "Active" = deactivated_at IS NULL.
--     При попытке: ABORT с сообщением.
CREATE TRIGGER prevent_last_admin_demotion
  AFTER DELETE ON user_roles
  WHEN OLD.role = 'admin'
   AND NOT EXISTS (
     SELECT 1
     FROM user_roles ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.role = 'admin'
       AND u.deactivated_at IS NULL
   )
BEGIN
  SELECT RAISE(ABORT, 'at least one active admin must exist');
END;

-- 5c. Симметричный invariant: запрет deactivate last admin.
--     Реализуется в API endpoint (POST /api/admin/users/[id]/deactivate),
--     потому что trigger на UPDATE users срабатывает после факта изменения,
--     а отыграть UPDATE назад в SQLite нельзя (rollback на trigger
--     ABORT откатывает statement, но логика сложна — проще в коде).
--
-- См. src/pages/api/admin/users/[id]/deactivate.ts
