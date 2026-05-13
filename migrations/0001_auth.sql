-- Migration: 0001_auth.sql
-- Date:      2026-05-13
-- Spec:      docs/Architecture.md §9 (v0.8.2), decisions_archive.md 2026-05-12
-- Rollback:  (dev only) DROP TABLE audit_log;
--            DROP TABLE auth_sessions;
--            DROP TABLE auth_methods;
--            DROP TABLE users;
--            На production откат делается forward-migration'ом.
--
-- Содержание:
--   - users           — identity + profile, БЕЗ auth secrets
--   - auth_methods    — multi-method auth (password + N OAuth identities)
--   - auth_sessions   — refresh sessions (access JWT отдельно, stateless)
--   - audit_log       — auth-события для compliance + forensic

PRAGMA foreign_keys = ON;

-- ============================================================
-- users — identity + profile, БЕЗ auth secrets.
-- Email — единственный канонический identity ключ.
-- Auth secrets (password hash, OAuth provider IDs) хранятся
-- в auth_methods — один user может иметь N методов.
-- ============================================================
CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  email_verified_at INTEGER,                      -- unix seconds; NULL = не верифицирован
  name              TEXT,
  locale            TEXT NOT NULL
                    CHECK(locale IN ('en','ru')),
  role              TEXT NOT NULL DEFAULT 'student'
                    CHECK(role IN ('student','instructor','admin')),
  referral_code     TEXT NOT NULL UNIQUE,         -- генерируется при создании user-а
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_users_email          ON users(email);
CREATE INDEX idx_users_referral_code  ON users(referral_code);

-- ============================================================
-- auth_methods — multi-method auth.
-- UNIQUE (user_id, kind) — один password / один google / один
--   discord на user (нельзя два password method'а одновременно).
-- UNIQUE (kind, provider_user_id) — один Google ID = один user
--   (защита от подмены/duplicate identity).
-- ============================================================
CREATE TABLE auth_methods (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL
                           REFERENCES users(id) ON DELETE CASCADE,
  kind                     TEXT NOT NULL
                           CHECK(kind IN ('password','google','discord')),
  -- password: PBKDF2-SHA256 600k iter; формат `iterations:salt:hash` base64
  secret_hash              TEXT,
  -- OAuth: stable provider user id (Google "sub" claim / Discord snowflake)
  provider_user_id         TEXT,
  provider_email           TEXT,                  -- email на момент link, для audit
  provider_email_verified  INTEGER,               -- 0/1 — что сообщил провайдер
  created_at               INTEGER NOT NULL,
  last_used_at             INTEGER,
  UNIQUE(user_id, kind),
  UNIQUE(kind, provider_user_id)
);
CREATE INDEX idx_auth_methods_user    ON auth_methods(user_id);
CREATE INDEX idx_auth_methods_lookup  ON auth_methods(kind, provider_user_id);

-- ============================================================
-- auth_sessions — refresh sessions.
-- Access JWT короткоживущий (15 мин) выдаётся stateless и НЕ хранится здесь.
-- Refresh — opaque secret 32 bytes в HttpOnly cookie, sha256 → token_hash.
-- Revoke = UPDATE auth_sessions SET revoked_at = now (soft).
-- ============================================================
CREATE TABLE auth_sessions (
  id              TEXT PRIMARY KEY,               -- refresh session id (opaque)
  user_id         TEXT NOT NULL
                  REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,                  -- sha256(refresh_secret_plain)
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  last_seen_at    INTEGER,
  user_agent      TEXT,
  ip_hash         TEXT,                           -- sha256(ip + IP_HASH_SALT), GDPR-safe
  revoked_at      INTEGER                         -- NULL = active; not-null = revoked
);
CREATE INDEX idx_sessions_user     ON auth_sessions(user_id);
CREATE INDEX idx_sessions_expires  ON auth_sessions(expires_at);

-- ============================================================
-- audit_log — все auth-события для compliance + forensic.
-- Records ВКЛЮЧАЕМ СРАЗУ (см. decisions_archive.md 2026-05-12).
-- ON DELETE SET NULL: при удалении user audit сохраняется
--   с NULL user_id, чтобы не потерять forensic trail.
-- ============================================================
CREATE TABLE audit_log (
  id            TEXT PRIMARY KEY,
  user_id       TEXT
                REFERENCES users(id) ON DELETE SET NULL,
  event         TEXT NOT NULL,
                -- 'register', 'login', 'logout', 'oauth_link',
                -- 'password_set', 'email_verify', 'password_reset',
                -- 'login_failed', 'session_revoked', 'method_unlink'
  method        TEXT,                             -- 'password' | 'google' | 'discord' | NULL
  ip_hash       TEXT,
  user_agent    TEXT,
  metadata      TEXT,                             -- JSON-encoded детали (cause, provider, etc.)
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_audit_user   ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_event  ON audit_log(event, created_at DESC);
