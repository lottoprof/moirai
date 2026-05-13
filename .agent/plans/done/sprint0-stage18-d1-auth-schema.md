# Sprint 0 Stage 18 — D1 setup + auth schema migration

## Context

Architecture v0.8.2 (`docs/Architecture.md` §9) фиксирует **19 таблиц**
D1-схемы с обновлённой auth-моделью (multi-method через `auth_methods`,
audit_log, типизированные поля). Сейчас:

- `moirai-prod` D1 БД **не создана** в CF
- `wrangler.toml` все биндинги закомментированы
- `migrations/` пусто, `db/types.ts` отсутствует
- `worker-configuration.d.ts` сгенерирован для пустого Env

Stage 18 = первый D1 setup проекта. Делаем только **auth subset**
(4 таблицы из 19) — остальные 15 будут добавляться отдельными
миграциями когда дойдём до соответствующих фич (programmes/runs —
Sprint 1, payments — Sprint 1+, resources/promo/referrals — позже).

## Принципы

1. **Иммутабельность миграций.** Закоммиченный `migrations/NNNN_*.sql`
   не редактируется. Любая правка — новая миграция.
2. **Один логический change = одна миграция.** Auth-таблицы все
   связаны (FK references) — кладём в одну миграцию `0001_auth.sql`.
3. **Field type conventions** (формализованы в Architecture §9):
   - IDs — TEXT (UUID v7 / nanoid)
   - Timestamps — INTEGER unix-seconds
   - Booleans — INTEGER 0/1
   - Money — INTEGER cents
   - Enums — TEXT + CHECK constraint
   - IP — sha256-хэш (GDPR)
4. **PRAGMA foreign_keys = ON** в начале каждой миграции
   (CF D1 включает по умолчанию, но явно — для self-doc).
5. **После каждой миграции** — handoff в `pages-ssr` для
   обновления `db/types.ts` (TS-типы строк, без ORM).

## Этапы

### 18a — создать D1 БД на CF

```bash
corepack pnpm exec wrangler d1 create moirai-prod
```

Wrangler выведет:
```
✅ Successfully created DB 'moirai-prod' in region <REGION>
[[d1_databases]]
binding = "DB"
database_name = "moirai-prod"
database_id = "<UUID>"
```

`database_id` записать в memory `cf_account.md` для будущих сессий
(не секрет, видна в Dashboard).

### 18b — обновить `wrangler.toml`

Раскомментить блок и вписать database_id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "moirai-prod"
database_id = "<UUID-from-18a>"
migrations_dir = "migrations"
```

Сгенерить типы:

```bash
corepack pnpm exec wrangler types
```

`worker-configuration.d.ts` обновится — `interface Env { DB: D1Database; ... }`.

### 18c — добавить KV bindings (для OAuth state + verify tokens + rate-limit)

В Stage 19 будут нужны три KV namespace. Чтобы один раз настроить
биндинги — делаем здесь. Через wrangler:

```bash
corepack pnpm exec wrangler kv namespace create KV_OAUTH_STATE
corepack pnpm exec wrangler kv namespace create KV_VERIFY_TOKENS
corepack pnpm exec wrangler kv namespace create KV_RATELIMIT
```

Каждая команда выдаст `id` — раскомментить блоки в `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV_OAUTH_STATE"
id = "<id-1>"

[[kv_namespaces]]
binding = "KV_VERIFY_TOKENS"
id = "<id-2>"

[[kv_namespaces]]
binding = "KV_RATELIMIT"
id = "<id-3>"
```

Снова `wrangler types` → коммит `worker-configuration.d.ts`.

### 18d — миграция `0001_auth.sql`

`migrations/0001_auth.sql`:

```sql
-- Migration: 0001_auth.sql
-- Date:      2026-05-12
-- Rollback:  DROP TABLE audit_log; DROP TABLE auth_sessions;
--            DROP TABLE auth_methods; DROP TABLE users;
--            (только для dev; на prod — ALTER через новую миграцию)

PRAGMA foreign_keys = ON;

-- ============================================================
-- users — identity + profile, БЕЗ auth secrets
-- ============================================================
CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  email_verified_at INTEGER,                              -- NULL = не верифицирован
  name              TEXT,
  locale            TEXT NOT NULL CHECK(locale IN ('en','ru')),
  role              TEXT NOT NULL DEFAULT 'student'
                    CHECK(role IN ('student','instructor','admin')),
  referral_code     TEXT UNIQUE NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_referral_code ON users(referral_code);

-- ============================================================
-- auth_methods — multi-method auth (password + N OAuth)
-- ============================================================
CREATE TABLE auth_methods (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                     TEXT NOT NULL
                           CHECK(kind IN ('password','google','discord')),
  -- password: PBKDF2-SHA256 600k iter, формат `salt:hash` (base64)
  secret_hash              TEXT,
  -- OAuth: provider's stable user id (Google "sub", Discord snowflake)
  provider_user_id         TEXT,
  provider_email           TEXT,
  provider_email_verified  INTEGER,                       -- 0/1 от провайдера
  created_at               INTEGER NOT NULL,
  last_used_at             INTEGER,
  UNIQUE(user_id, kind),
  UNIQUE(kind, provider_user_id)
);
CREATE INDEX idx_auth_methods_user ON auth_methods(user_id);
CREATE INDEX idx_auth_methods_lookup ON auth_methods(kind, provider_user_id);

-- ============================================================
-- auth_sessions — refresh sessions (access JWT отдельно, stateless)
-- ============================================================
CREATE TABLE auth_sessions (
  id              TEXT PRIMARY KEY,                       -- refresh session id (opaque)
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,                          -- sha256(refresh_secret)
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  last_seen_at    INTEGER,
  user_agent      TEXT,
  ip_hash         TEXT,                                   -- sha256(ip + IP_HASH_SALT)
  revoked_at      INTEGER
);
CREATE INDEX idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_sessions_expires ON auth_sessions(expires_at);

-- ============================================================
-- audit_log — все auth-события (compliance + forensic)
-- ============================================================
CREATE TABLE audit_log (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  event         TEXT NOT NULL,
                -- register / login / logout / oauth_link / password_set /
                -- email_verify / password_reset / login_failed / session_revoked
  method        TEXT,                                     -- password / google / discord
  ip_hash       TEXT,
  user_agent    TEXT,
  metadata      TEXT,                                     -- JSON для деталей
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_event ON audit_log(event, created_at DESC);
```

### 18e — применить миграцию

```bash
# Локально (miniflare sqlite в .wrangler/state/v3/d1/)
corepack pnpm exec wrangler d1 migrations apply moirai-prod --local

# Remote (production)
corepack pnpm exec wrangler d1 migrations apply moirai-prod --remote
```

Remote — **требует явного подтверждения от пользователя** (см.
`.agent/skills/wrangler/SKILL.md` § D1). Не запускать без `go`.

Sanity-check после apply:

```bash
corepack pnpm exec wrangler d1 execute moirai-prod --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
# → users, auth_methods, auth_sessions, audit_log, _cf_KV (CF service), d1_migrations
```

### 18f — `db/types.ts` (manual TS-types, без ORM)

Создать `db/types.ts` рядом с миграциями (top-level):

```ts
/*
 * D1 row types — manual mapping для текущих миграций.
 * Обновляется атомарно с каждой миграцией (схема-агент инициирует
 * handoff в pages-ssr после новой миграции).
 *
 * Никакого ORM. Конвенция полей — см. docs/Architecture.md §9.
 */

export type Locale = "en" | "ru";
export type Role = "student" | "instructor" | "admin";
export type AuthMethodKind = "password" | "google" | "discord";

export interface UserRow {
  id: string;
  email: string;
  email_verified_at: number | null;
  name: string | null;
  locale: Locale;
  role: Role;
  referral_code: string;
  created_at: number;
  updated_at: number;
}

export interface AuthMethodRow {
  id: string;
  user_id: string;
  kind: AuthMethodKind;
  secret_hash: string | null;
  provider_user_id: string | null;
  provider_email: string | null;
  provider_email_verified: number | null;     // 0/1
  created_at: number;
  last_used_at: number | null;
}

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

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  event: string;
  method: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  metadata: string | null;                    // JSON-encoded
  created_at: number;
}
```

### 18g — обновить `cf_account.md` memory

Записать database_id + KV namespace IDs в memory для будущих сессий.

### 18h — verification

```bash
pnpm lint && pnpm typecheck && pnpm build
```

Build не использует D1 на главной (statics + middleware без БД-запросов
сейчас), но `wrangler types` обновляет `Env` интерфейс → typecheck
видит `DB`, `KV_*`.

Sanity SQL на remote:

```bash
corepack pnpm exec wrangler d1 execute moirai-prod --remote \
  --command="INSERT INTO users (id, email, locale, role, referral_code, created_at, updated_at)
             VALUES ('test1','test@example.com','en','student','TESTCODE',1747044000,1747044000);
             SELECT * FROM users;"

# Очистить test row
corepack pnpm exec wrangler d1 execute moirai-prod --remote \
  --command="DELETE FROM users WHERE id='test1'"
```

## Verification

- [ ] `moirai-prod` D1 БД создана на CF (видна в Dashboard → D1)
- [ ] 3 KV namespace созданы (KV_OAUTH_STATE, KV_VERIFY_TOKENS,
      KV_RATELIMIT)
- [ ] `wrangler.toml` содержит D1 + 3 KV bindings
- [ ] `worker-configuration.d.ts` экспортит `Env.DB`, `KV_*`
- [ ] `migrations/0001_auth.sql` создан и закоммичен
- [ ] `wrangler d1 migrations apply --local` → success
- [ ] `wrangler d1 migrations apply --remote` → success (по go от user)
- [ ] `SELECT name FROM sqlite_master WHERE type='table'` показывает
      `users`, `auth_methods`, `auth_sessions`, `audit_log`
- [ ] `db/types.ts` создан, TypeScript видит exported types
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные
- [ ] Memory `cf_account.md` обновлена IDs

## Out of scope (другие миграции, Sprint 1+)

- `0002_education.sql` — `modules`, `module_content`, `runs`,
  `run_modules` (когда дойдём до dashboard / programme runs)
- `0003_purchase.sql` — `enrollments`, `sessions`, `session_participants`,
  `session_modules`, `homework`, `feedback` (Sprint 1+ когда auth готов)
- `0004_payments.sql` — `payments` (когда подключим MoR / Stripe)
- `0005_promo_codes.sql` — `promo_codes`
- `0006_referrals.sql` — `referrals` table (`users.referral_code` уже в 0001)
- `0007_resources.sql` — `resources`, `resource_consumption`

Каждая — отдельная миграция в момент когда конкретная фича начинает
писаться. Не заводим пустые таблицы спекулятивно.

## Critical files

- `wrangler.toml` (D1 + 3 KV bindings)
- `worker-configuration.d.ts` (regenerated)
- `migrations/0001_auth.sql` (новый)
- `db/types.ts` (новый)
- `~/.claude/projects/-home-a3-git-moirai/memory/cf_account.md` (DB+KV ids)

## Dependencies

- Wrangler OAuth уже залогинен под Nastya account (Stage deploy)
- `.agent/skills/wrangler/SKILL.md` — D1 workflow
- `.agent/agents/schema.md` — schema-agent правила миграций

## Reference

- `docs/Architecture.md` §9 (v0.8.2) — финальная схема всех 19 таблиц
- `decisions_archive.md` 2026-05-12 — auth model rationale
- `.agent/skills/wrangler/SKILL.md` § D1 — wrangler 4 D1 commands
