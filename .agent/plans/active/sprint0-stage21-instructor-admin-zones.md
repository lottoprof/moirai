# Sprint 0 Stage 21 — Instructor + Admin zones + multi-role + schema

## Context

После Stage 20 (student dashboard mock) обсуждение модели и зон вышло
на переосмысление core абстракций. Зафиксировано в:

- `decisions_archive.md` 2026-05-17 — полная запись (контракт)
- `Architecture.md` §3, §5, §6 — обновлено
- `.agent/rules/architecture.md`, `boundaries.md` — обновлено
- agents: `astro-student.md` (renamed from `astro-dashboard`),
  `astro-instructor.md` (NEW), `astro-admin.md` (updated)
- migrations: `0003_user_roles_deactivation.sql`,
  `0004_modules_enrollments.sql`

Stage 21 — **реализация** этих решений: схема, layouts, nav, pages,
endpoints, role-aware redirects, mock-данные.

**Scope:** "Visual + working API + schema" (как договорились). НЕ
"только mock" и не "полная реальная функциональность". Endpoints
работают (PATCH role применяется в БД), но платежи/feedback/runs —
Sprint 2.

**Не входит в Stage 21:**
- Sync pipeline external repo → D1+R2 (Sprint 2)
- Реальные платежи (Stripe/Lemon Squeezy) — Sprint 2
- Sessions / homework submission / feedback — Sprint 2
- Vidstack интеграция в module page — Sprint 1+
- Compose UI с drag-reorder — Sprint 1+

## Этапы

### 21a — Apply migrations + schema infrastructure

Файлы:
- `migrations/0003_user_roles_deactivation.sql` (уже написан)
- `migrations/0004_modules_enrollments.sql` (уже написан)
- `db/types.ts` — добавить типы `UserRoleRow`, `ModuleRow`, `EnrollmentRow`, `EnrollmentModuleRow`
- `wrangler types` regenerate

Команды:
```bash
# Local dev
corepack pnpm exec wrangler d1 migrations apply moirai-prod --local
# Production
corepack pnpm exec wrangler d1 migrations apply moirai-prod --remote
```

Бутстрап первого admin'a (см. `.agent/skills/deploy/SKILL.md`):
```bash
USER_ID=$(corepack pnpm exec wrangler d1 execute moirai-prod \
  --remote --json --command "SELECT id FROM users WHERE email='lottoprof@gmail.com';" \
  | jq -r '.[0].results[0].id')
NOW=$(date +%s)
corepack pnpm exec wrangler d1 execute moirai-prod --remote --command \
  "INSERT INTO user_roles (user_id, role, granted_by, granted_at) VALUES ('$USER_ID', 'admin', NULL, $NOW);"
```

### 21b — Server-side foundations (lib/server)

Новые файлы:

- `src/lib/server/guards.ts`
  - `requireRole(ctx, role): Promise<UserWithRoles | Response>`
  - `getUserWithRoles(env, userId): Promise<UserWithRoles | null>`
- `src/lib/server/auth-redirect.ts`
  - `computeRedirectTarget(user, returnTo): string`
  - `sanitizeReturnTo(returnTo, user): string | null`
- `src/lib/server/access.ts`
  - `hasAccessToModule(env, userId, slug): Promise<boolean>`
- `src/lib/server/modules.ts`
  - `resolveDependencies(env, slug): Promise<string[]>` (DFS + visited)
  - `getDependents(env, enrollmentId, slug): Promise<string[]>`
- `src/lib/server/enrollments.ts`
  - `addModuleToEnrollment(env, enrollmentId, slug, byUserId)` (с auto-resolve)
  - `removeModuleFromEnrollment(env, enrollmentId, slug)` (с dependents check)
  - `createEnrollment(env, userId, programmeSlug, leadInstructorId?)` (с copy default_modules)

Тесты — пока вручную через cURL endpoints в 21f.

### 21c — `/[locale]/inactive` страница

`src/pages/[locale]/inactive.astro`:
- Минимальный layout (только logo + текст)
- "Your account is inactive. Contact support."
- Sign out + Manage account ссылки
- i18n inline (en/ru) до Stage 7

`src/lib/server/guards.ts` `requireRole` редиректит на эту страницу
если `user.deactivated_at IS NOT NULL`.

### 21d — Update Student layout/dashboard для multi-role

- `src/components/dashboard/DashboardNav.astro` — добавить
  zone-switcher (если у user'а >1 роли)
- `src/pages/[locale]/dashboard/index.astro` — заменить
  `verifyRefreshSession`+`findUserById` на `requireRole(ctx, 'student')`
- `src/pages/[locale]/account.astro` — dynamic layout по primary
  role (через helper)

### 21e — Instructor zone

Создать:

- `src/layouts/instructor/Layout.astro` — аналог DashboardLayout
- `src/components/instructor/InstructorNav.astro` — Queue / My Students
  / Schedule / Account → + zone-switcher
- `src/components/instructor/HwQueueCard.astro` — review-queue карточка
- `src/components/instructor/StudentRow.astro` — строка в MY STUDENTS
- `src/components/instructor/StatCard.astro` — переиспользовать из
  dashboard или дублировать (мокап показывает идентичный стиль)
- `src/pages/[locale]/instructor/index.astro` — overview:
  - SSR `requireRole(ctx, 'instructor')`
  - Pending homework (STUB — пока feedback таблицы нет)
  - My students (`SELECT enrollments WHERE lead_instructor_id = me`)
  - Next session card (STUB)

Stage 21 рендерит **STUB-данные** для homework / sessions потому что
feedback и sessions таблицы Sprint 2. Реальные данные о enrollments —
из 0004 миграции.

### 21f — Admin zone — layouts + overview + users page

Создать:

- `src/layouts/admin/Layout.astro`
- `src/components/admin/AdminNav.astro` — Overview / Users / Enrollments
  / Modules / Account → + zone-switcher
- `src/components/admin/RoleStrip.astro` — amber-плашка "ADMIN PANEL"
  (из mockup)
- `src/components/admin/UsersTable.astro`
- `src/components/admin/UserRow.astro` — строка с roles-badge ленте
- `src/components/admin/UserDrawer.astro` — детали + edit form
  - Поля: name, email, locale
  - Roles: 3 checkboxes
  - Enrollments: read-only список + "+ Add" → sub-modal
  - Кнопки: Save / Send password reset / Deactivate / Anonymize
- `src/components/admin/FilterBar.astro` — search + role pills
- `src/components/admin/StatCard.astro` — переиспользовать
- `src/pages/admin/index.astro` — overview:
  - 4 stats (active enrollments, pending homework, revenue (STUB), avg progress)
  - Students mini-table
  - Modules mini-list (read из D1)
- `src/pages/admin/users.astro` — full users management

### 21g — Admin API endpoints

Создать в `src/pages/api/admin/`:

```
users.ts                          GET (list), POST (create)
users/[id].ts                     GET, PATCH (name/email/locale)
users/[id]/roles.ts               PATCH ({ roles: [...] })
users/[id]/reset-password.ts      POST
users/[id]/send-password-setup.ts POST
users/[id]/deactivate.ts          POST
users/[id]/reactivate.ts          POST
users/[id]/anonymize.ts           POST

enrollments.ts                    GET, POST (grant)
enrollments/[id].ts               GET, PATCH (status, lead_instructor_id)
enrollments/[id]/modules.ts       POST (add with auto-resolve)
enrollments/[id]/modules/[slug].ts DELETE
```

Все требуют `requireRole(ctx, 'admin')`. Все мутации логируют в `audit_log`.

### 21h — Login flow обновление

- `src/pages/api/auth/login.ts` — возвращать `redirect_to` в response
  через `computeRedirectTarget(user, returnTo)`
- `src/pages/[locale]/login.astro` script — читать `data.redirect_to`
- `src/pages/api/auth/oauth/google/callback.ts` — заменить calculation
  finalRedirect на `computeRedirectTarget`
- `src/pages/api/auth/verify-email.ts` — same
- `src/pages/[locale]/login.astro` + `register.astro` — frontmatter
  guard: если уже залогинен — redirect на role-home

### 21i — POST /api/admin/users — create + send password-setup email

- Reuse existing password-reset infrastructure
- Создаём user без auth_methods → INSERT user_roles → optional
  enrollment → generate reset-token → send "Your account is ready"
  email (вариант password-reset template)
- Если admin отметил programme при создании — POST одной batch'ью:
  user + user_roles + enrollment + enrollment_modules (copy default)
- audit_log: `user_created_by_admin`

### 21j — Tests + lint/typecheck/build

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

Manual E2E через cURL (с admin auth-token):
- create user → recieve setup email → set password → login → land на role-home
- PATCH /api/admin/users/[id]/roles { roles: ['instructor'] } → check guards
- POST /deactivate → login → redirect на /inactive
- Add module to enrollment с requires_modules → auto-resolve работает

### 21k — Local preview

```bash
corepack pnpm dev
```

Сценарии:
- Login as lottoprof (admin) → land на /admin/
- Zone-switcher показывает "→ Instructor" если у user'а есть instructor роль
- /admin/users показывает всех user'ов, drawer работает
- Создание test instructor через UI: invite → set password → login → /instructor/
- Создание test student через UI → enrollment → дашборд показывает modules

### 21l — Deploy + первого admin bootstrap

```bash
corepack pnpm exec wrangler d1 migrations apply moirai-prod --remote
# Bootstrap admin (см. 21a)
corepack pnpm exec wrangler pages deploy ./dist --project-name moirai --branch main \
  --commit-message "$(git log -1 --pretty=%s)"
```

Smoke:
- https://moiraionline.pro/admin/ — попасть только админу
- https://moiraionline.pro/en/instructor/ — 404 для lottoprof (он только admin)
- Назначить себе instructor роль через /admin/users → redirect → /admin/ остаётся,
  но zone-switcher показывает "→ Instructor"
- Перейти в /[locale]/instructor/ — увидеть UI

### 21m — Update skills + commit + план в done

- Update `.agent/skills/deploy/SKILL.md` — добавить bootstrap procedure
- Commit
- `git mv .agent/plans/active/sprint0-stage21-instructor-admin-zones.md .agent/plans/done/`

## Risks / open

1. **CF Pages D1 SQLite version** — миграция требует 3.35+ для DROP COLUMN.
   Проверить через `SELECT sqlite_version()` перед apply.

2. **Wrangler D1 migrations apply** в первый раз создаёт metadata
   таблицу `_cf_KV` — проверить что миграционная история сохранена.

3. **JWT decode без role** — текущий JWT шифрует role. После 21h
   старые access-токены (15 min TTL) перестанут понимать новую логику.
   План: после deploy все existing sessions переинициализируются на
   следующем refresh. Не breaking, но 15-минутный window incompatibility.

4. **`/api/admin/modules`** — модули в D1 пустые (sync pipeline Sprint 2).
   Stage 21 admin/modules показывает empty state "no modules yet —
   sync via external repo (Sprint 2)".

5. **Auth API uses `users.role`** — текущий код login.ts /
   oauth-callback.ts / user-ops.ts ссылаются на `user.role`. Все
   места найти и заменить на `user.roles` (Set<Role>).

6. **First admin: lottoprof@gmail.com** — после applies миграции 0003,
   обязательно выполнить bootstrap SQL до deploy'а (иначе lottoprof
   будет 0 ролей → guards отдадут 404 → lockout).

## Готовность

- [ ] 21a migrations + types
- [ ] 21b server foundations (guards, auth-redirect, modules, enrollments)
- [ ] 21c /[locale]/inactive page
- [ ] 21d update student dashboard для multi-role + zone-switcher
- [ ] 21e instructor zone (layout/nav/pages/components)
- [ ] 21f admin zone (layout/nav/overview/users page)
- [ ] 21g admin API endpoints
- [ ] 21h login flow update
- [ ] 21i POST /api/admin/users (create + email)
- [ ] 21j lint/typecheck/build clean
- [ ] 21k local preview verified
- [ ] 21l deploy + first-admin bootstrap
- [ ] 21m skills update + plan → done
