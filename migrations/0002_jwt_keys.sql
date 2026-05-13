-- Migration: 0002_jwt_keys.sql
-- Date:      2026-05-14
-- Spec:      docs/Architecture.md §9 (v0.8.3), decisions_archive.md 2026-05-14
-- Rollback:  (dev only) DROP INDEX idx_jwt_keys_one_active;
--                       DROP INDEX idx_jwt_keys_status;
--                       DROP TABLE jwt_keys;
--
-- Содержание: одна таблица jwt_keys для rotation-ready JWT signing.
--
-- Иерархия:
--   env.MASTER_SECRET (wrangler secret)
--     └─ AES-GCM encrypt/decrypt ──► jwt_keys.secret_encrypted
--                                       │
--                                       ▼
--                                  HS256 signing key (256-bit random)
--                                       │
--                                       ▼
--                                  JWT (header.kid → row.kid)

PRAGMA foreign_keys = ON;

-- ============================================================
-- jwt_keys — множественные HS256 signing keys с rotation.
--
-- status:
--   active     — единственный одновременно, подписывает новые JWTs.
--                Enforced partial unique index ниже.
--   deprecated — старый ключ, JWT с его kid ещё валидируются
--                (grace period до их exp). Новых не подписывает.
--   revoked    — компрометирован/истёк, JWT с его kid отвергаются.
--
-- secret_encrypted — JSON-encoded `{ iv, ct, tag }` (base64) от
-- AES-GCM шифрования через MASTER_SECRET. Plaintext signing key
-- НИКОГДА не хранится в БД.
-- ============================================================
CREATE TABLE jwt_keys (
  kid               TEXT PRIMARY KEY,             -- "v1-YYYY-MM-DD-<uuid8>"
  secret_encrypted  TEXT NOT NULL,                -- AES-GCM blob (JSON)
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active','deprecated','revoked')),
  created_at        INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,
  rotated_at        INTEGER,                      -- момент active → deprecated
  revoked_at        INTEGER                       -- момент → revoked
);

-- Lookup по status (verify path: get key by kid обычно, но иногда
-- listing для admin/rotation tools)
CREATE INDEX idx_jwt_keys_status ON jwt_keys(status);

-- Партиальный UNIQUE: ровно один active ключ одновременно.
-- БД сама обеспечит — даже если две конкурентных INSERT попадут в
-- race condition, вторая упадёт с UNIQUE violation (это и есть
-- "kid collision" handling в auto-init flow).
CREATE UNIQUE INDEX idx_jwt_keys_one_active
  ON jwt_keys(status)
  WHERE status = 'active';
