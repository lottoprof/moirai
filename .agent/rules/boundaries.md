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

## Dashboard layer (ЛК — student/instructor)

Owner: `agents/astro-dashboard.md`.

Пути:
- `src/pages/[locale]/dashboard/**`
- `src/components/dashboard/**`
- `src/layouts/dashboard/**`

Допускается:
- Astro islands с `client:idle` / `client:visible` /
  `client:load` / `client:only`.
- Vidstack media player (lecture / review режимы).
- Чтение Content Collections для tier features (через
  `getCollection`).
- Импорт из `src/lib/shared/`.

Запрещено:
- Прямые обращения к биндингам со стороны клиента — только через
  `src/pages/api/**`.
- Доступ без auth-guard'а (см. `src/middleware.ts`).

## Admin layer

Owner: `agents/astro-admin.md`.

Пути:
- `src/pages/admin/**` (без префикса локали — `/admin/...`)
- `src/components/admin/**`
- `src/layouts/admin/**`

Допускается:
- Astro islands и интерактивные формы.
- CRUD UI поверх API-эндпоинтов.
- Импорт из `src/lib/shared/`.

Запрещено:
- Локализация URL (admin — внутренний инструмент, без `[locale]/`).
- Доступ без `users.role = 'admin'` (guard в `src/middleware.ts`).
- Прямые мутации D1 / R2 / KV из клиентских компонентов — только
  через `src/pages/api/**`.

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
