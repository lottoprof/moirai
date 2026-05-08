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
   `[locale]/`-префикс не применяется. `/admin/login` — точка входа.
2. **Auth-guard на каждой странице.** Middleware `src/middleware.ts`
   проверяет `auth_sessions` + `users.role = 'admin'`. Без guard'а
   страницы `admin/` не существуют.
3. **CRUD поверх API.** Все мутации D1/R2/KV — через эндпоинты в
   `src/pages/api/**`. Прямые обращения к биндингам из компонентов
   запрещены.
4. **Островная гидрация** — допустима по необходимости (`client:idle`
   / `client:visible` / `client:load` для форм). Не злоупотреблять —
   серверная отрисовка по умолчанию.
5. **Никакого SEO.** `<meta name="robots" content="noindex">` в
   layout, никаких canonical/OG/Schema.org.
6. **Анти-хардкод.** Цены, имена программ, локали, лимиты ресурсов —
   читаются из источников (Content Collections / D1 / KV /
   `astro.config.mjs`). См. `forbidden.md` §Anti-hardcode.
7. **Импорты:** разрешено из `src/lib/shared/`. Запрещено из
   `src/lib/server/`, `src/components/public/`,
   `src/components/dashboard/`.

## Зоны UI (см. `architecture.md` §6)

```
/admin/login
/admin                            — dashboard
/admin/programmes                 — каталог (модули + атрибуты)
/admin/programmes/[id]/modules    — модули: атрибуты, тело в R2
/admin/runs                       — создание/редактирование (tier + price)
/admin/runs/[id]/schedule         — расписание run_modules
/admin/runs/[id]/students         — список студентов
/admin/homework                   — очередь домашек
/admin/sessions                   — расписание сессий
/admin/users                      — поиск/блокировка
/admin/promo-codes                — промо-коды CRUD
/admin/referrals                  — реферальная активность
/admin/resources                  — capacity / warn_at_pct
/admin/settings                   — KV-настройки
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
  "target_agent": "astro-public|astro-dashboard|content|pages-ssr|schema|docs|reviewer|e2e",
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
