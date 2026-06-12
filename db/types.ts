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

/** cohort.status — состояние конкретной запущенной cohort'ы (migration 0009).
 *  - open       — приём applications, до start_date
 *  - running    — start_date наступил, курс идёт
 *  - completed  — end_date наступил, курс закончен
 *  - cancelled  — admin отменил (instructor unavailable etc.)
 */
export type CohortStatus = "open" | "running" | "completed" | "cancelled";

/** module_progress.view_status — Stage 26 (migration 0010) renamed in 0016
 *  (Student LK v2). Stage 26 enum 'in_progress'/'done' upgraded to 'viewed'
 *  (см. migration 0016).
 *  После Student LK v2 — completion определяется через homework_submissions
 *  (практический) или session.scheduled_at + 1h (теоретический). Этот status
 *  только "был ли open модуль" (audit). */
export type ModuleViewStatus = "not_started" | "viewed";

/** Stage 26 enum, заменён `ModuleViewStatus` после migration 0016 (Student LK v2).
 *  TRANSITIONAL: оставлен для существующего student-modules.ts — Stage B удалит. */
export type ModuleProgressStatus = "not_started" | "in_progress" | "done";

/** sessions.status — расписание live-sessions per cohort
 *  (migration 0011, Student LK v2 Q4). */
export type SessionStatus = "scheduled" | "passed" | "cancelled" | "rescheduled";

/** cohorts.meeting_provider — provider live-meeting'a
 *  (migration 0011, Student LK v2 Q4). */
export type MeetingProvider = "zoom" | "teams" | "gmeet" | "other";

/** homework_submissions.status — lifecycle ДЗ
 *  (migration 0014, Student LK v2 Q1+Q2).
 *  - pending          — uploaded, ждёт review
 *  - needs_revision   — preпод отверг + обязательный коммент
 *  - approved         — preпод принял
 *  - auto_approved    — pending + uploaded_at < next_session.scheduled_at,
 *                      переключается auto-approve cron'ом */
export type HomeworkStatus = "pending" | "needs_revision" | "approved" | "auto_approved";

/** homework_submissions.priority — для queue preпода
 *  (migration 0014, Student LK v2 Q2.C review).
 *  - normal — обычная submission
 *  - low    — resubmit после approved (module уже done) — preпод может игнорировать */
export type HomeworkPriority = "normal" | "low";

/** application.status — lifecycle state machine (FLOW-22 / migration 0009).
 *
 *  Normal path:
 *    awaiting_payment → paid → running → completed
 *
 *  Terminal branches (любая стадия → terminal):
 *    cancelled — клиент / admin отменил
 *    expired   — cohort стартовала без оплаты
 *    refunded  — оплачено, потом возвращено (FLOW-9a)
 */
export type ApplicationStatus =
  | "awaiting_payment"
  | "paid"
  | "running"
  | "completed"
  | "cancelled"
  | "expired"
  | "refunded";

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
  | "user_updated_by_admin"
  | "user_deactivated"
  | "user_reactivated"
  | "user_anonymized"
  | "role_granted"
  | "role_revoked"
  | "enrollment_granted"
  | "enrollment_status_changed"
  | "enrollment_module_added"
  | "enrollment_module_removed"
  // Apply flow events (FLOW-24 / migration 0009)
  | "apply_submitted"
  | "offer_accepted"
  | "application_status_changed"
  | "application_cancelled"
  | "application_transferred"
  | "refund_processed";

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
  /** FLOW-31 (migration 0009): marketing email opt-in. 0 = default,
   *  1 = клиент отметил чекбокс на checkout. Unsubscribe → toggle back. */
  marketing_opt_in: number;
  /** Student LK v2 (migration 0015): GDPR soft-delete timestamp.
   *  NULL = active. NOT NULL = аккаунт удалён: email/password_hash → NULL,
   *  auth_methods DELETE, auth_sessions revoked. Login невозможен.
   *  Stage A: optional (existing queries не SELECT'ят). Stage F (GDPR endpoint)
   *  обновит SELECT statements. */
  deleted_at?: number | null;
  /** Student LK v2 Q2f (migration 0015): email opt-out для feedback notifications.
   *  Default 1 (включено). 0 = студент opt-out'нулся через /account UI.
   *  Stage A: optional. */
  notifications_email?: number;
  /** Instructor LK v2 Q9 (migration 0017): opt-in/out на ежедневный
   *  digest preподa (pending + late + сегодняшние sessions).
   *  Default 1. Поле есть у всех users, но cron шлёт только role=instructor. */
  instructor_digest_opt_in?: number;
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
  /** 0 = default 1d (обычный логин без "remember me"); 1 = 7d (remember-me checkbox или OAuth). */
  persistent: number;
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
  /** Student LK v2 (migration 0013): описание ДЗ переносится в workbook как
   *  секция `## Домашнее задание`. TRANSITIONAL — Stage B refactor +
   *  migration 0013 удалят. */
  homework_md: string | null;        // markdown
  // Storage
  /** Student LK v2 (migration 0013): заменён `workbook_r2_key`.
   *  TRANSITIONAL — Stage B refactor + migration 0013 удалят. */
  body_r2_key: string;
  /** Student LK v2 (migration 0012, after backfill M3): короткое полотно
   *  для live share-screen. Pattern: 'modules/{slug}/presentation.{locale}.md'.
   *  Nullable пока methodist не загрузил — UI показывает placeholder. */
  presentation_r2_key: string | null;
  /** Student LK v2 (migration 0012, after backfill M3): длинный материал
   *  для самостоятельной работы + секция ДЗ.
   *  Pattern: 'modules/{slug}/workbook.{locale}.md'. */
  workbook_r2_key: string | null;
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
  /** Student LK v2 (migration 0015): retention archival timestamp.
   *  NULL = ещё active или в grace window. NOT NULL → cron retention
   *  обработал: homework_submissions DELETE, files в R2 DELETE,
   *  enrollment_stats INSERT, curriculum_feedback INSERT (анонимно).
   *  После archived — все access к enrollment data заблокирован
   *  (см. ACL § 3 в docs/student-lk-v2-spec.md).
   *  Stage A: optional (existing queries не SELECT'ят). */
  archived_at?: number | null;
  /** Student LK v2 Q10 (migration 0015): GDPR delete request marker.
   *  Используется в `on_completion` mode (LK_CONFIG default) — флаг
   *  set при user request, retention triggers immediately после
   *  completion/cancellation без 30-day grace. */
  gdpr_delete_requested_at?: number | null;
  /** Student LK v2 Q10.F (migration 0015): pre-archive warning email
   *  idempotency. Set cron'ом за 7 дней до archival. */
  pre_archive_email_sent_at?: number | null;
  /** Student LK v2 Q2f (migration 0015): timestamp последнего открытия
   *  /dashboard/homework. Используется для in-app badge: подсветка
   *  submissions с reviewed_at > homework_last_seen_at. */
  homework_last_seen_at?: number | null;
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
  /** Student LK v2 Q1.A review (migration 0015): instructor override unlock.
   *  Если NOT NULL — модуль unlocked независимо от schedule (обходит
   *  `unlocked = now >= session.scheduled_at − unlock_lead_hours`).
   *  Set через explicit instructor action в UI (с confirmation modal).
   *  Stage A: optional (existing queries не SELECT'ят). Stage D обновит. */
  unlock_override_at?: number | null;
  /** Instructor user_id для audit. */
  unlock_override_by?: string | null;
  /** Короткий текст для audit (optional). */
  unlock_override_reason?: string | null;
}

/**
 * module_progress — progress tracking student'a по конкретному модулю
 * внутри enrollment'а (migration 0010 / Stage 26).
 *
 * 1 row per (enrollment_id, module_slug). Locale хранится для context
 * (язык body который студент видит), не для PK.
 *
 * Lifecycle:
 *   not_started → in_progress (auto при первом open) → done (explicit "Mark complete")
 *
 * Lazy creation: row создаётся при первом open страницы модуля; если
 * методист добавит модуль в programme после старта когорты — студент
 * увидит его новым без data-migration.
 */
export interface ModuleProgressRow {
  enrollment_id: string;
  module_slug: string;
  locale: Locale;
  /** Student LK v2 (migration 0016): renamed to `view_status`.
   *  Legacy values 'in_progress'/'done' нормализованы в 'viewed'.
   *  TRANSITIONAL — Stage B refactor удалит. */
  status: ModuleProgressStatus;
  /** Student LK v2 (migration 0016): renamed from `status`. Audit only —
   *  source of truth для completion перенесён в homework_submissions
   *  (практический) или session.scheduled_at + 1h (теоретический).
   *  Stage A: optional (Stage 26 код всё ещё читает `status`, Stage B обновит). */
  view_status?: ModuleViewStatus;
  last_seen_at: number | null;
  completed_at: number | null;       // legacy, может быть удалён в future
  created_at: number;
  updated_at: number;
}

// ============================================================
// Apply flow rows (migration 0009 — Stage 14a)
// ============================================================

/**
 * slots — admin-конфиг расписания (FLOW-30).
 *
 * `programme_id` ссылается на slug из Content Collection `programmes`
 * (не FK — soft-validation в коде).
 *
 * `days_json` — JSON array weekday codes: `'["mon","thu"]'`. UI рендерит
 * через Intl.DateTimeFormat per locale, без hardcoded enums.
 *
 * `time_et` — фикс ET формата `'HH:MM'` (FLOW-26).
 *
 * `instructor_id` — FK users(id) ON DELETE SET NULL. NULL = slot не
 * назначен инструктору (admin переназначит).
 *
 * `active = 0` → slot скрыт из публичной grid'a, новые cohorts не
 * публикуются. Existing cohorts продолжают работать.
 */
export interface SlotRow {
  id: string;
  programme_id: string;
  days_json: string;             // '["mon","thu"]'
  time_et: string;               // 'HH:MM'
  instructor_id: string | null;
  max_students: number;
  active: number;                // 0 | 1
  created_at: number;
  updated_at: number;
}

/**
 * cohorts — auto-published runs из slots (FLOW-7, migration 0009).
 *
 * Создаются скриптом `scripts/publish-cohorts.mjs` на горизонт 12 мес.
 *
 * `start_date` — unix sec UTC midnight. Отображается на UI через
 * Intl.DateTimeFormat с `timeZone='America/New_York'` (FLOW-26).
 *
 * `end_date` — denormalized snapshot при INSERT, вычисляется как
 * `start_date + ROUND(programme.lessons_total / 2)` недель (FLOW-8).
 *
 * `apply_count` / `paid_count` — denormalized counters, maintained
 * app-side в `applications.ts` helpers, НЕ триггерами.
 */
export interface CohortRow {
  id: string;
  programme_id: string;
  slot_id: string;
  start_date: number;            // unix sec
  end_date: number;              // unix sec
  status: CohortStatus;
  apply_count: number;
  paid_count: number;
  /** Student LK v2 Q4 (migration 0011): persistent meeting setup для cohort.
   *  Provider диктует label "Join Zoom" / "Join Teams" / "Join Google Meet"
   *  в UI. URLs — opaque (admin responsibility).
   *  Stage A: optional (existing queries не SELECT'ят). Stage B/C сделают
   *  required и обновят SELECT statements. */
  meeting_provider?: MeetingProvider;
  /** Join URL — видят все участники. NULL → "Link will appear closer to the session". */
  meeting_url?: string | null;
  /** Host URL — для instructor (Zoom split host/join, Teams/Meet тоже). NULL → use meeting_url. */
  meeting_host_url?: string | null;
  /** Student LK v2 Q4.A review (migration 0011): JSON-stringified array
   *  ["beg-01-...","beg-02-..."], фиксируется при cohort creation из
   *  programme.default_modules. Programme changes НЕ каскадят в active cohorts.
   *  Stage A: optional (см. meeting_provider note). */
  modules_snapshot_json?: string;
  /** Admin instructor management (migration 0018): явный lead instructor
   *  cohort'ы. Раньше косвенно через slot.instructor_id; теперь явное поле,
   *  admin может переопределить независимо от slot. NULL = unassigned →
   *  /admin/cohorts покажет warning badge.
   *  При создании cohort'ы из slot — backfill (см. migration 0018). */
  lead_instructor_id?: string | null;
  /** Cohort conflict policy Q8 (migration 0019): sort order на apply UI
   *  когда есть параллельные cohorts с одинаковой (programme, start_date).
   *  Lower = first. NULL = в конце. Admin задаёт через /admin/cohorts/[id]. */
  public_priority?: number | null;
  /** Cohort conflict policy Q8 (migration 0019): override "Group A" label
   *  для apply UI. NULL → UI генерирует index per (programme, start_date). */
  public_label?: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * applications — заявки клиентов с lifecycle status machine (FLOW-22).
 *
 * Один user × programme — может иметь несколько applications во времени
 * (re-take после completed/cancelled/expired/refunded — FLOW-25), но
 * только **одну одновременно active** (enforced partial unique index
 * в migration 0009).
 *
 * `enrollment_id` — NULL пока не paid. После webhook
 * `checkout.session.completed` создаётся enrollment row + UPDATE.
 *
 * `terms_version` / `refund_version` / `privacy_version` — snapshot
 * на момент checkout (FLOW-2), нужны для GDPR proof of consent.
 *
 * `stripe_session_id` / `stripe_payment_id` — для reconciliation со
 * Stripe dashboard'ом, refund processing, audit trail.
 *
 * `country` — ISO 3166-1 alpha-2, optional (auto-detect IP на Apply).
 *
 * `marketing_opt_in` — копируется на users.marketing_opt_in при
 * checkout success.
 */
export interface ApplicationRow {
  id: string;
  user_id: string;
  programme_id: string;
  cohort_id: string;
  enrollment_id: string | null;
  status: ApplicationStatus;
  country: string | null;
  marketing_opt_in: number;      // 0 | 1
  age_confirmed: number;         // 0 | 1
  terms_version: string | null;
  refund_version: string | null;
  privacy_version: string | null;
  stripe_session_id: string | null;
  stripe_payment_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  created_at: number;
  updated_at: number;
}

// ============================================================
// Student LK v2 rows (migrations 0011, 0014)
// ============================================================

/**
 * sessions — расписание live-sessions per cohort
 * (migration 0011, Student LK v2 Q4).
 *
 * 1:1 mapping `module_slug` (UNIQUE (cohort_id, module_slug)). N:N через
 * junction table — § 5 Future migrations.
 *
 * scheduled_at — UTC unix seconds. Display через Intl.DateTimeFormat
 * browser-side (locale) + ET label для preподa. Auto-generation учитывает
 * DST per session date (см. scripts/lib/compute-session-dates.mjs).
 *
 * meeting_url / meeting_host_url — overrides. NULL → берётся cohort.meeting_*.
 *
 * status lifecycle:
 *   scheduled → passed (cron при now > scheduled_at)
 *   scheduled → cancelled (admin action)
 *   scheduled → rescheduled (admin action — updated scheduled_at)
 */
export interface SessionRow {
  id: string;
  cohort_id: string;
  module_slug: string;
  order_idx: number;
  scheduled_at: number;
  meeting_url: string | null;
  meeting_host_url: string | null;
  status: SessionStatus;
  notes: string | null;
  /** Admin instructor management (migration 0018): per-session substitute
   *  preподa (sickness и т.п.). NULL → используется cohort.lead_instructor_id.
   *  Substitute должен быть qualified для module_slug этой session. */
  substitute_instructor_id?: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * instructor_qualifications — M2M user × module (migration 0018).
 * Admin assigns lead_instructor / substitute только из qualified.
 */
export interface InstructorQualificationRow {
  user_id: string;
  module_slug: string;
  granted_by: string;
  granted_at: number;
}

/**
 * homework_submissions — студенческие сдачи ДЗ + instructor review
 * (migration 0014, Student LK v2 Q2).
 *
 * 1 row per upload (resubmit = новая row, не overwrite). file_r2_key
 * pattern: `homework/{enrollment_id}/{id}.<ext>`.
 *
 * idempotency_key — client UUID для retry safety finalize endpoint.
 * UNIQUE (enrollment_id, idempotency_key) гарантирует one row per
 * intent.
 *
 * status lifecycle — см. HomeworkStatus enum.
 *
 * priority — для queue preпода. low = resubmit после approved
 * (module уже done, preпод может игнорировать без consequences).
 *
 * LLM fields (llm_draft_*) — зарезервированы для future. В MVP NULL.
 *
 * instructor_annotation_r2_key — optional, preпод может upload
 * annotated copy рядом с оригиналом.
 *
 * feedback_email_sent_at — idempotency для outbound Resend email.
 */
export interface HomeworkSubmissionRow {
  id: string;
  enrollment_id: string;
  module_slug: string;
  idempotency_key: string;
  // file
  file_r2_key: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: number;
  is_late: number;                       // 0 | 1
  // student
  student_comment: string | null;        // markdown ≤ 2000 chars
  // status
  status: HomeworkStatus;
  priority: HomeworkPriority;
  // LLM pre-check (future, reserved)
  llm_draft_status: "approved" | "needs_revision" | null;
  llm_draft_comment: string | null;
  llm_checked_at: number | null;
  // instructor review
  reviewed_by: string | null;
  reviewed_at: number | null;
  instructor_comment: string | null;     // markdown ≤ 10000 chars
  instructor_annotation_r2_key: string | null;
  instructor_annotation_uploaded_at: number | null;
  // notification state
  feedback_email_sent_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * enrollment_stats — aggregate counters, заполняется при retention
 * archival (migration 0014, Student LK v2 Q10).
 *
 * Без PII. enrollment_id остаётся как FK на soft-archived enrollment
 * row (которая сама теряет homework files и rows).
 */
export interface EnrollmentStatsRow {
  enrollment_id: string;
  cohort_id: string;
  programme_slug: string;
  total_submissions: number;
  approved_count: number;
  needs_revision_count: number;
  auto_approved_count: number;
  late_count: number;
  completed_at: number;
  archived_at: number;
}

/**
 * curriculum_feedback — анонимные instructor comments для curriculum
 * analysis (migration 0014, Student LK v2 Q10.E review).
 *
 * Сохраняются при retention archival. БЕЗ user_id / enrollment_id /
 * submission_id (анонимизация). cohort_id остаётся как context (per
 * lottoprof). instructor_id — staff, не PII студента.
 */
export interface CurriculumFeedbackRow {
  id: string;
  cohort_id: string;
  module_slug: string;
  instructor_id: string | null;
  homework_status: "approved" | "needs_revision" | "auto_approved";
  comment_text: string;
  original_at: number;
}

// ============================================================
// Helpers — узкие типы для INSERT (без id/created/updated_at когда
// они выставляются на app-слое непосредственно перед insert).
// Добавляются по мере появления query-функций, не спекулятивно.
// ============================================================
