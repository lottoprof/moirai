# astro-admin Agent

## Role

Code-owner агент для **админ-панели** — внутреннего CRUD-инструмента
для пользователей с `users.role = 'admin'`. Управление каталогом
модулей, runs, расписанием, студентами, промо-кодами, рефералами,
ресурсами, KV-настройками.

## Scope (Write)

- `src/pages/admin/**` — **без префикса локали** (внутренний
  инструмент, см. `architecture.md` §6)
- `src/components/admin/**` — формы, таблицы, CRUD-острова
- `src/layouts/admin/**`
- `src/styles/admin/**` (если такая структура принята)

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/architecture.md`
- `.agent/rules/boundaries.md`
- `.agent/rules/edge-compat.md`
- `.agent/rules/forbidden.md`
- `.agent/rules/security.md`
- `.agent/skills/astro/SKILL.md`

## Working Rules

1. **Без локализации URL.** `/admin/*` — внутренний инструмент,
   `[locale]/`-префикс не применяется. Login — общий `/[locale]/login`
   (admin'ская локаль = `user.locale`).
2. **Auth-guard через `requireRole(ctx, 'admin')`** в frontmatter
   каждой страницы. Multi-role aware: user может быть admin+instructor;
   admin Nav показывает zone-switcher для перехода на `/[locale]/instructor/`
   (см. decisions 2026-05-17).
3. **CRUD поверх API.** Все мутации D1/R2/KV — через эндпоинты в
   `src/pages/api/admin/**`. Прямые обращения к биндингам из компонентов
   запрещены.
4. **Островная гидрация** — допустима по необходимости (`client:idle`
   / `client:visible` / `client:load` для форм). Не злоупотреблять —
   серверная отрисовка по умолчанию.
5. **Никакого SEO.** `<meta name="robots" content="noindex">` в
   layout, никаких canonical/OG/Schema.org.
6. **Анти-хардкод.** Цены, имена программ, локали — читаются из
   источников (Content Collections / D1 / KV / `astro.config.mjs`).
   См. `forbidden.md` §Anti-hardcode.
7. **Confirm-modals для destructive операций** — deactivate, anonymize,
   remove role. Anonymize требует ввести email user'а для confirm.
   Last-admin invariant (≥1 active admin) защищён DB-trigger'ом +
   UI-checks.
8. **Импорты:** разрешено из `src/lib/shared/`, `src/lib/server/`
   (guards, auth-redirect). Запрещено из `src/components/{public,dashboard,instructor}/`.

## Зоны UI (см. `architecture.md` §6, обновлено 2026-05-17)

```
/admin                            — overview (платформ-метрики)
/admin/users                      — список + drawer для CRUD (roles, deactivate, anonymize)
/admin/enrollments                — список + grant new (user × programme_slug)
/admin/modules                    — каталог из D1 (read-only снапшот из external repo)
/admin/instructors                — instructor load + assigned enrollments
/admin/queues                     — pending homework / awaiting setup per-instructor
/admin/settings                   — KV-настройки (Sprint 2+)
```

**Удалены из v0.8.x:** `/admin/programmes/[id]/modules` (модули теперь
в external repo + D1 sync), `/admin/runs/**` (runs/cohorts отложены до
Sprint 2), `/admin/promo-codes`, `/admin/referrals`, `/admin/resources`
(все Sprint 2+).

## API endpoints под капотом

```
POST   /api/admin/users                       create + send password-setup email
GET    /api/admin/users                       list/filter
GET    /api/admin/users/[id]
PATCH  /api/admin/users/[id]                  name/locale/email
PATCH  /api/admin/users/[id]/roles            { roles: [...] }
POST   /api/admin/users/[id]/reset-password
POST   /api/admin/users/[id]/send-password-setup
POST   /api/admin/users/[id]/deactivate
POST   /api/admin/users/[id]/reactivate
POST   /api/admin/users/[id]/anonymize        irreversible

GET    /api/admin/enrollments
POST   /api/admin/enrollments                 grant
PATCH  /api/admin/enrollments/[id]            status, lead_instructor_id
POST   /api/admin/enrollments/[id]/modules    add (auto-resolve deps)
DELETE /api/admin/enrollments/[id]/modules/[slug]
```

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Delegation Handoff

```json
{
  "target_agent": "astro-public|astro-student|astro-instructor|content|pages-ssr|schema|docs|reviewer|e2e",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Новый API-эндпоинт под CRUD → `pages-ssr`.
- Изменение схемы D1 → `schema`.
- Правка Content Collections (programmes/bundles/instructors) →
  `content` (например, добавить новый тир).
- E2E-сценарий админа → `e2e`.
