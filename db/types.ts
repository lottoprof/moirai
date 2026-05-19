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
/** Roles: M2M через user_roles table (migration 0003). Один user
 *  может иметь любую комбинацию (admin+instructor — admin-преподаватель). */
export type Role = "student" | "instructor" | "admin";
export type AuthMethodKind = "password" | "google" | "discord";
export type JwtKeyStatus = "active" | "deprecated" | "revoked";

/** modules lifecycle: methodist пушит в external repo с status, sync
 *  pipeline апдейтит D1. `draft` невидим студентам, `archived` скрыт
 *  из catalogue но existing enrollments работают. */
export type ModuleStatus = "draft" | "published" | "archived";

/** enrollment.status — runtime жизнь экземпляра programme'a у user'a. */
export type EnrollmentStatus = "active" | "completed" | "cancelled" | "refunded";

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
  | "method_unlink"
  | "user_created_by_admin"
  | "user_deactivated"
  | "user_reactivated"
  | "user_anonymized"
  | "role_granted"
  | "role_revoked"
  | "enrollment_granted"
  | "enrollment_status_changed"
  | "enrollment_module_added"
  | "enrollment_module_removed";

// ============================================================
// Row types — soft mirror таблиц D1.
// ============================================================

/**
 * users — identity + profile. Auth secrets хранятся в auth_methods.
 *
 * Roles — НЕ в users (column удалён в migration 0003), а в user_roles
 * M2M. Для получения ролей используй `getUserWithRoles(env, userId)`.
 *
 * `deactivated_at` — soft-deactivation (migration 0003). NULL =
 * активный пользователь. NOT NULL = login разрешён, но redirect на
 * `/{locale}/inactive`, доступ к контенту revoked через
 * `hasAccessToModule`.
 */
export interface UserRow {
  id: string;
  email: string;
  email_verified_at: number | null;
  name: string | null;
  locale: Locale;
  referral_code: string;
  deactivated_at: number | null;
  created_at: number;
  updated_at: number;
}

/** users + roles set — возвращается `getUserWithRoles`. */
export interface UserWithRoles extends UserRow {
  roles: Set<Role>;
}

/** user_roles row — M2M user × role (migration 0003). */
export interface UserRoleRow {
  user_id: string;
  role: Role;
  granted_by: string | null;
  granted_at: number;
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

/**
 * modules — каталог из external repo (migration 0004, 0007).
 *
 * PK = (slug, locale). Body живёт в R2 по `body_r2_key`. Видео тоже
 * в R2. `requires_modules_json` — массив slug'ов модулей-зависимостей.
 *
 * Метаданные (summary/objectives/concepts/homework) денормализованы в
 * D1 columns из yaml frontmatter для list-view performance (programme
 * page, dashboard module-card, instructor compose).
 */
export interface ModuleRow {
  slug: string;
  locale: Locale;
  title: string;
  track: string | null;
  status: ModuleStatus;
  has_video: number;            // 0 | 1
  has_external_video: number;   // 0 | 1 — YouTube/Vimeo refs in body (subset has_video)
  has_homework: number;         // 0 | 1
  has_text: number;             // 0 | 1
  default_lessons: number;      // количество занятий (не дней)
  requires_modules_json: string;     // JSON-array of slugs
  // Methodist hints (см. methodist-modules-guide.md)
  suggested_programme: string | null;
  suggested_order: number | null;
  // Денормализованные метаданные (из yaml frontmatter)
  summary: string | null;
  objectives_json: string;           // JSON-array of strings
  concepts_json: string;             // JSON-array of strings
  homework_md: string | null;        // markdown
  // Storage
  body_r2_key: string;
  video_r2_key: string | null;
  source_commit: string | null;
  created_at: number;
  published_at: number | null;
  archived_at: number | null;
  synced_at: number;
}

/**
 * enrollments — instance user × programme_slug (migration 0004).
 *
 * `programme_slug` ссылается на Content Collection `programmes/[slug]`.
 * `price_paid_amount` + `features_json` — snapshot на момент покупки.
 * `lead_instructor_id` — single lead (Option 1 из decisions 2026-05-17),
 * NULL = unassigned.
 */
export interface EnrollmentRow {
  id: string;
  user_id: string;
  programme_slug: string;
  status: EnrollmentStatus;
  price_paid_amount: number;     // cents
  price_paid_currency: string;
  features_json: string;          // JSON object
  lead_instructor_id: string | null;
  enrolled_at: number;
  completed_at: number | null;
  cancelled_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * enrollment_modules — mutable список модулей в enrollment'е
 * (migration 0004). Instructor может add/remove, при INSERT'е
 * auto-resolve дополняет транзитивные `requires_modules`.
 *
 * `module_slug` ссылается на `modules.slug` (без FK — модули могут
 * быть archived/удалены).
 */
export interface EnrollmentModuleRow {
  enrollment_id: string;
  module_slug: string;
  order_idx: number;
  added_by: string;
  added_at: number;
}

// ============================================================
// Helpers — узкие типы для INSERT (без id/created/updated_at когда
// они выставляются на app-слое непосредственно перед insert).
// Добавляются по мере появления query-функций, не спекулятивно.
// ============================================================
