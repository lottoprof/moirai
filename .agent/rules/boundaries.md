# Boundaries (moirai)

Жёсткое разделение зон. Кросс-зональные правки требуют явного
обоснования и handoff'а между агентами.

## Public layer

Owner: `agents/astro-public.md`.

Пути:
- `src/pages/[locale]/*.astro` (без `dashboard/`, без `app/`)
- `src/components/public/**`
- `src/layouts/public/**`
- `src/styles/public/**` (если такая структура принята)
- `public/**` (статика)

Допускается:
- Astro `.astro` шаблоны.
- Vanilla `<script>` (hoisted) или внешний vanilla JS.
- CSS / CSS-only анимации.
- Чтение Content Collections через `getCollection`.
- Импорт из `src/lib/shared/`.

Запрещено:
- Любые `client:*` директивы.
- UI-фреймворки (React/Vue/Svelte/Solid и т.п.).
- Импорт из `src/lib/server/`, `src/components/dashboard/`,
  `src/components/admin/`.
- Захардкоженные цены / счётные числа / meta-теги (см.
  `forbidden.md`).

## Student layer (ЛК — role: 'student')

Owner: `agents/astro-student.md` (бывший `astro-dashboard.md`).

Пути:
- `src/pages/[locale]/dashboard/**`
- `src/components/dashboard/**`
- `src/layouts/dashboard/**`

Допускается:
- Astro islands с `client:idle` / `client:visible` /
  `client:load` / `client:only`.
- Vidstack media player (lecture / review режимы).
- Чтение Content Collections (programmes — для разворачивания
  `programme_slug` в title/marketing/features).
- Чтение D1 (enrollments, enrollment_modules, modules) через
  `Astro.locals.runtime.env.DB`.
- Импорт из `src/lib/shared/`, `src/lib/server/` (auth guards,
  modules helpers).

Запрещено:
- Прямые обращения к биндингам со стороны клиента — только через
  `src/pages/api/**`.
- Доступ без `requireRole(ctx, 'student')` guard'а.
- Импорт из `src/components/{instructor,admin}/`.

## Instructor layer (role: 'instructor')

Owner: `agents/astro-instructor.md`.

Пути:
- `src/pages/[locale]/instructor/**`
- `src/components/instructor/**`
- `src/layouts/instructor/**`

Допускается:
- Astro islands (compose UI, review queue с timestamp-feedback).
- Чтение/мутации `enrollments` и `enrollment_modules` через
  `/api/instructor/**` endpoints (только для enrollment'ов, где
  user — lead_instructor).
- Чтение `modules` каталога (`status='published'`).
- Импорт из `src/lib/shared/`, `src/lib/server/`.

Запрещено:
- Доступ без `requireRole(ctx, 'instructor')` guard'а.
- Мутации enrollment'ов, где user не lead_instructor (этим
  занимается admin).
- Импорт из `src/components/{public,dashboard,admin}/`.

## Admin layer (role: 'admin')

Owner: `agents/astro-admin.md`.

Пути:
- `src/pages/admin/**` (без префикса локали — `/admin/...`)
- `src/components/admin/**`
- `src/layouts/admin/**`

Допускается:
- Astro islands и интерактивные формы.
- CRUD UI поверх `/api/admin/**` endpoints.
- Импорт из `src/lib/shared/`, `src/lib/server/`.

Запрещено:
- Локализация URL (admin — внутренний инструмент, без `[locale]/`).
- Доступ без `requireRole(ctx, 'admin')` guard'а.
- Прямые мутации D1 / R2 / KV из клиентских компонентов — только
  через `src/pages/api/**`.
- Импорт из `src/components/{public,dashboard,instructor}/`.

## Cross-zone files

- `src/pages/[locale]/account.astro` — общая страница, layout
  dynamic по primary role (`user_roles` highest priority).
- `src/pages/[locale]/inactive.astro` — заглушка для deactivated
  user'ов. Минимальный layout, без зональной nav.
- `src/lib/server/guards.ts` — `requireRole`, `getUserWithRoles`,
  `hasAccessToModule`.
- `src/lib/server/auth-redirect.ts` — `computeRedirectTarget`,
  `sanitizeReturnTo`.

## Server layer

Owner: `agents/pages-ssr.md`.

Пути:
- `src/pages/api/**` (включая `api/media/[type]/[id]`,
  `api/apply`, MoR webhook'и)
- `src/lib/server/**`
- `src/middleware.ts`
- `astro.config.mjs`
- `wrangler.toml`

Допускается:
- Чтение `Astro.locals.runtime.env.<NAME>` (D1/KV/R2/secrets/vars).
- Web Crypto API (`crypto.subtle`).
- `aws4fetch` для presigned R2 URL.
- `resend` SDK для email (edge-compat обязателен).
- Edge-compatible npm-пакеты.

Запрещено:
- Node API (см. `edge-compat.md`).
- Импорт серверного кода в `components/public/`,
  `components/dashboard/`, `components/admin/` (всё через явные
  API-эндпоинты).

## Content layer

Owner: `agents/content.md`.

Пути:
- `src/content/**` — Content Collections (programmes, bundles,
  instructors, segments, pages, journal, works)
- `src/content/voice-guide.md`
- `drafts/**` (agent-driven journal pipeline; вне `src/`,
  не попадает в build)

Допускается:
- Frontmatter (yaml) + MDX-тело.
- Содержательные изменения, новые записи, переводы.
- Изменение zod-схем коллекций (через handoff в `pages-ssr` —
  schema живёт в `src/content/config.ts`).

Запрещено:
- Изменение страниц/компонентов/Astro-конфигов.
- Захардкоживать цифры/цены вне frontmatter полей tier.
- Дублировать id между programmes и bundles (один URL namespace).

## Schema layer

Owner: `agents/schema.md`.

Пути:
- `migrations/**` — пронумерованные SQL-миграции D1
- `db/types.ts` — TS-типы строк D1, пишутся вручную, обновляются
  атомарно с миграциями

Запрещено:
- Изменение коммитнутых миграций.
- Прямые `wrangler d1 execute --remote` мутации без файла
  миграции.
- Изменение прикладного кода (`src/`).

## Cross-boundary changes

- API-контракт `src/pages/api/<route>` ↔ потребитель в
  `dashboard/` или `admin/` — через явный handoff между
  `pages-ssr` и соответствующим UI-агентом.
- Никакая бизнес-логика не дублируется между public / dashboard /
  admin.
- Любое изменение `wrangler.toml`, `astro.config.mjs` — только
  через `pages-ssr`.
- Любое изменение `src/content/config.ts` (schema коллекций) —
  только через `pages-ssr` после согласования с `content`.
