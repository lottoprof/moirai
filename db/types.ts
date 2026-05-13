/*
 * D1 row types — ручной mapping, без ORM (decision v0.8.1).
 *
 * Обновляется атомарно с каждой миграцией: schema-агент после
 * добавления миграции инициирует handoff в pages-ssr для правки
 * этого файла. См. `.agent/agents/schema.md` и
 * `.agent/agents/pages-ssr.md`.
 *
 * Конвенции (docs/Architecture.md §9 v0.8.2):
 *   - IDs           — string (TEXT в D1, UUID v7 или nanoid)
 *   - timestamps    — number (INTEGER unix-seconds)
 *   - booleans      — number (INTEGER 0/1)
 *   - money         — number (INTEGER cents)
 *   - enums         — узкие string-литералы (TEXT + CHECK)
 *   - IP            — sha256-hex string ("ip_hash"), plaintext не хранится
 *   - nullable      — `| null`, не optional, чтобы row-shape был точным
 *   - JSON-поля     — string (encoded), парсинг на стороне приложения
 */

// ============================================================
// Domain enums (Architecture v0.8.2 §9)
// ============================================================

export type Locale = "en" | "ru";
export type UserRole = "student" | "instructor" | "admin";
export type AuthMethodKind = "password" | "google" | "discord";
export type JwtKeyStatus = "active" | "deprecated" | "revoked";

/** События в audit_log.event — открытое множество, расширяется по
 *  мере добавления auth-flow'ов; CHECK constraint в SQL отсутствует
 *  специально, чтобы не блокировать новые события миграцией. */
export type AuditEvent =
  | "register"
  | "login"
  | "logout"
  | "oauth_link"
  | "password_set"
  | "email_verify"
  | "password_reset"
  | "login_failed"
  | "session_revoked"
  | "method_unlink";

// ============================================================
// Row types — soft mirror таблиц D1.
// ============================================================

/** users — identity + profile. Auth secrets хранятся в auth_methods. */
export interface UserRow {
  id: string;
  email: string;
  email_verified_at: number | null;
  name: string | null;
  locale: Locale;
  role: UserRole;
  referral_code: string;
  created_at: number;
  updated_at: number;
}

/**
 * auth_methods — multi-method auth.
 *
 * Для kind='password': `secret_hash` заполнен (PBKDF2 600k);
 *   `provider_*` — null.
 * Для OAuth (google/discord): `secret_hash` null; `provider_user_id`
 *   обязателен; `provider_email` + `provider_email_verified` — snapshot
 *   на момент link, для audit (не используется для login decisions).
 */
export interface AuthMethodRow {
  id: string;
  user_id: string;
  kind: AuthMethodKind;
  secret_hash: string | null;
  provider_user_id: string | null;
  provider_email: string | null;
  provider_email_verified: number | null;  // 0 | 1 | null
  created_at: number;
  last_used_at: number | null;
}

/**
 * auth_sessions — refresh sessions.
 *
 * `token_hash` — sha256 от refresh_secret в HttpOnly cookie у пользователя.
 * Plaintext secret нигде не хранится.
 *
 * `revoked_at` null = активная сессия. Любое not-null значение → отказ
 * рефреша на следующей попытке. Soft-revoke: row остаётся для audit.
 */
export interface AuthSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  last_seen_at: number | null;
  user_agent: string | null;
  ip_hash: string | null;
  revoked_at: number | null;
}

/**
 * audit_log — auth-события.
 *
 * `user_id` nullable (ON DELETE SET NULL): forensic trail сохраняется
 * даже при удалении user-а. `metadata` — JSON-string с деталями
 * (provider, fail reason, прежние значения для unlink).
 */
export interface AuditLogRow {
  id: string;
  user_id: string | null;
  event: string;            // расширяемое множество; TS-литерал AuditEvent — рекомендация
  method: string | null;    // 'password' | 'google' | 'discord' | null
  ip_hash: string | null;
  user_agent: string | null;
  metadata: string | null;  // JSON-encoded
  created_at: number;
}

/**
 * jwt_keys — HS256 signing keys для access JWT.
 *
 * `secret_encrypted` — JSON-encoded AES-GCM blob (`{iv, ct, tag}` в
 * base64), зашифрован env.MASTER_SECRET. Plaintext signing key
 * НИКОГДА не хранится в БД.
 *
 * Статусы: 'active' (единственный одновременно), 'deprecated' (только
 * verify, не sign), 'revoked' (отвергается всегда). См. Architecture
 * §9 v0.8.3 + decisions_archive.md 2026-05-14.
 */
export interface JwtKeyRow {
  kid: string;                        // "v1-YYYY-MM-DD-<uuid8>"
  secret_encrypted: string;           // JSON-encoded AES-GCM blob
  status: JwtKeyStatus;
  created_at: number;
  expires_at: number;
  rotated_at: number | null;          // когда active → deprecated
  revoked_at: number | null;          // когда → revoked
}

// ============================================================
// Helpers — узкие типы для INSERT (без id/created/updated_at когда
// они выставляются на app-слое непосредственно перед insert).
// Добавляются по мере появления query-функций, не спекулятивно.
// ============================================================
