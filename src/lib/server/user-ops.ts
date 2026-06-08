/*
 * User + auth_methods query helpers.
 *
 * Используются в auth endpoints (register, login, OAuth callback,
 * verify-email, password-reset, account settings). Уровень
 * абстракции: запросы к D1, без бизнес-логики (которая в endpoint'ах).
 *
 * Email везде normalized to lowercase до SELECT/INSERT — устраняет
 * mojibake'и при сравнении.
 *
 * Все timestamps — INTEGER unix-seconds (см. v0.8.2 conventions).
 */

import type {
  UserRow,
  AuthMethodRow,
  AuthMethodKind,
  Locale,
} from "../../../db/types";

// ============================================================
// users
// ============================================================

const USER_COLUMNS =
  "id, email, email_verified_at, name, locale, referral_code, deactivated_at, marketing_opt_in, notifications_email, instructor_digest_opt_in, deleted_at, created_at, updated_at";

/** SELECT user by email (case-insensitive). */
export async function findUserByEmail(
  env: Cloudflare.Env,
  email: string,
): Promise<UserRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = ?`,
  )
    .bind(email.toLowerCase())
    .first<UserRow>();
  return row ?? null;
}

/** SELECT user by id. */
export async function findUserById(
  env: Cloudflare.Env,
  id: string,
): Promise<UserRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
  )
    .bind(id)
    .first<UserRow>();
  return row ?? null;
}

/** SELECT user by referral_code (для перевыставления через реферальную ссылку). */
export async function findUserByReferralCode(
  env: Cloudflare.Env,
  code: string,
): Promise<UserRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE referral_code = ?`,
  )
    .bind(code)
    .first<UserRow>();
  return row ?? null;
}

export interface CreateUserInput {
  email: string;
  name?: string | null;
  locale: Locale;
  /** Если true — email_verified_at = now (для OAuth с verified email). */
  emailVerified?: boolean;
}

/**
 * INSERT user. Возвращает свежую строку (READ-back для актуальных
 * server-side default'ов). referral_code генерится автоматически.
 *
 * Уникальность email — invariant БД (UNIQUE constraint). Caller должен
 * сначала findUserByEmail, иначе INSERT упадёт с UNIQUE violation.
 */
export async function createUser(
  env: Cloudflare.Env,
  input: CreateUserInput,
): Promise<UserRow> {
  const id = crypto.randomUUID();
  const referralCode = generateReferralCode();
  const now = Math.floor(Date.now() / 1000);
  const emailVerifiedAt = input.emailVerified === true ? now : null;
  const email = input.email.toLowerCase();

  // INSERT users + INSERT user_roles одной batch'ью (migration 0003:
  // users.role удалён, roles живут в user_roles M2M). Default role —
  // 'student'. Иные роли назначаются admin'ом через /api/admin/users/[id]/roles.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
         (id, email, email_verified_at, name, locale, referral_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      email,
      emailVerifiedAt,
      input.name ?? null,
      input.locale,
      referralCode,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO user_roles (user_id, role, granted_by, granted_at)
       VALUES (?, 'student', NULL, ?)`,
    ).bind(id, now),
  ]);

  const created = await findUserById(env, id);
  if (!created) {
    throw new Error(`user-ops: createUser read-back failed for id ${id}`);
  }
  return created;
}

/** Отметить email верифицированным. Идемпотентно — повторный вызов перетирает timestamp. */
export async function markEmailVerified(
  env: Cloudflare.Env,
  userId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(now, now, userId)
    .run();
}

// ============================================================
// auth_methods
// ============================================================

const AUTH_METHOD_COLUMNS =
  "id, user_id, kind, secret_hash, provider_user_id, provider_email, provider_email_verified, created_at, last_used_at";

/** SELECT auth_method для user'а конкретного типа. */
export async function findAuthMethod(
  env: Cloudflare.Env,
  userId: string,
  kind: AuthMethodKind,
): Promise<AuthMethodRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${AUTH_METHOD_COLUMNS} FROM auth_methods WHERE user_id = ? AND kind = ?`,
  )
    .bind(userId, kind)
    .first<AuthMethodRow>();
  return row ?? null;
}

/**
 * SELECT OAuth identity по (kind, provider_user_id).
 * Используется в OAuth callback: получили sub/snowflake от провайдера,
 * ищем уже привязанный к user аккаунт.
 */
export async function findOauthIdentity(
  env: Cloudflare.Env,
  kind: AuthMethodKind,
  providerUserId: string,
): Promise<AuthMethodRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${AUTH_METHOD_COLUMNS} FROM auth_methods
       WHERE kind = ? AND provider_user_id = ?`,
  )
    .bind(kind, providerUserId)
    .first<AuthMethodRow>();
  return row ?? null;
}

/** Все методы аутентификации user-а — для отображения в profile + unlink validation. */
export async function getUserAuthMethods(
  env: Cloudflare.Env,
  userId: string,
): Promise<AuthMethodRow[]> {
  const result = await env.DB.prepare(
    `SELECT ${AUTH_METHOD_COLUMNS} FROM auth_methods
       WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<AuthMethodRow>();
  return result.results;
}

export interface LinkAuthMethodInput {
  userId: string;
  kind: AuthMethodKind;
  /** Для kind='password' — PBKDF2 hash из password.ts. */
  secretHash?: string | null;
  /** Для OAuth — provider's stable user id (sub/snowflake). */
  providerUserId?: string | null;
  providerEmail?: string | null;
  /** Что сказал провайдер о верификации email. */
  providerEmailVerified?: boolean | null;
}

/**
 * INSERT новый auth_method для user-а. Контракты enforce'ятся БД:
 *   UNIQUE (user_id, kind) — нельзя 2 password method'а
 *   UNIQUE (kind, provider_user_id) — нельзя 2 user'а с одним Google sub
 *
 * Caller должен поймать UNIQUE violation для clean error UX.
 */
export async function linkAuthMethod(
  env: Cloudflare.Env,
  input: LinkAuthMethodInput,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const providerEmailVerified =
    input.providerEmailVerified === null || input.providerEmailVerified === undefined
      ? null
      : input.providerEmailVerified
        ? 1
        : 0;

  await env.DB.prepare(
    `INSERT INTO auth_methods
       (id, user_id, kind, secret_hash, provider_user_id, provider_email, provider_email_verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.userId,
      input.kind,
      input.secretHash ?? null,
      input.providerUserId ?? null,
      input.providerEmail ?? null,
      providerEmailVerified,
      now,
    )
    .run();
}

/** UPDATE auth_methods.last_used_at — после успешного login/refresh. */
export async function touchAuthMethod(
  env: Cloudflare.Env,
  methodId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE auth_methods SET last_used_at = ? WHERE id = ?`,
  )
    .bind(now, methodId)
    .run();
}

/**
 * UPDATE password hash для существующего password method.
 * Используется в password reset + change password.
 */
export async function updatePasswordHash(
  env: Cloudflare.Env,
  userId: string,
  newSecretHash: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE auth_methods SET secret_hash = ?, last_used_at = ?
       WHERE user_id = ? AND kind = 'password'`,
  )
    .bind(newSecretHash, now, userId)
    .run();
}

/**
 * DELETE auth_method.
 * Caller должен ПРЕДВАРИТЕЛЬНО проверить что после удаления у user
 * останется хотя бы один метод входа — это enforces в endpoint'е,
 * не в БД (БД не знает про invariant "≥1 method per user").
 */
export async function unlinkAuthMethod(
  env: Cloudflare.Env,
  methodId: string,
): Promise<void> {
  await env.DB.prepare(`DELETE FROM auth_methods WHERE id = ?`)
    .bind(methodId)
    .run();
}

/**
 * Hard delete user — caacade очищает user_roles, auth_methods,
 * auth_sessions. Перед DELETE FROM users NULL'ит ссылки granted_by
 * во всех user_roles записях (FK без ON DELETE clause).
 *
 * Triggers prevent_role_orphan и prevent_last_admin_demotion (после
 * migration 0005) проверяют `EXISTS user` и пропускают cascade-delete
 * → удаление работает даже для последнего active admin'a.
 *
 * Для admin-UI: предпочитать `anonymize` (irreversible но preserves
 * audit). Hard `deleteUser` — для специальных кейсов (test cleanup,
 * GDPR full-erase, exceptional ops).
 */
export async function deleteUser(
  env: Cloudflare.Env,
  userId: string,
): Promise<void> {
  await env.DB.batch([
    // 1. NULL granted_by во всех user_roles где он указывает на этого user'a
    //    (FK без ON DELETE SET NULL — нужно ручное обнуление перед DELETE).
    env.DB.prepare(
      `UPDATE user_roles SET granted_by = NULL WHERE granted_by = ?`,
    ).bind(userId),
    // 2. DELETE user — cascade сносит user_roles, auth_methods, auth_sessions.
    //    audit_log.user_id → SET NULL per 0001 schema.
    env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId),
  ]);
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Сгенерить human-readable referral_code, формат `FILM-XXXXXX`.
 * Алфавит — без визуально похожих (0/O/I/L/1), чтобы устно/в SMS
 * проще передавать. 6 символов из 31 алфавита = ~30 бит энтропии,
 * unique check — на стороне БД (UNIQUE constraint на referral_code).
 */
function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) {
    suffix += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return `FILM-${suffix}`;
}
