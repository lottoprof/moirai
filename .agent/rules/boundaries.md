# Boundaries (moirai)

Жёсткое разделение зон. Кросс-зональные правки требуют явного обоснования.

## Public layer

Пути:
- `src/pages/*.astro` (без `app/`, без `api/`)
- `src/components/public/**`
- `src/layouts/public/**`
- `public/**` (статика)

Допускается:
- Astro `.astro` шаблоны.
- Vanilla `<script>` (hoisted) или внешний vanilla JS.
- CSS / CSS-only анимации (transition / `@keyframes`).
- Импорт из `src/lib/shared/`.

Запрещено:
- `client:*` директивы.
- Любые UI-фреймворки (React/Vue/Svelte/Solid и т.д.).
- Импорт из `src/lib/server/` или `src/components/app/`.

## App layer (защищённая зона ЛК)

Пути:
- `src/pages/app/**`
- `src/components/app/**`
- `src/layouts/app/**`

Допускается:
- Astro islands с `client:idle` / `client:visible` / `client:load`
  / `client:only`.
- Vidstack media player.
- Импорт из `src/lib/shared/`.
- Интерактивные компоненты выбранного фреймворка (если такой
  принят отдельным решением).

Запрещено:
- Прямые обращения к биндингам со стороны клиента (только через
  `src/pages/api/`).

## Server layer

Пути:
- `src/pages/api/**`
- `src/lib/server/**`
- `src/middleware.ts`

Допускается:
- Чтение `Astro.locals.runtime.env.<NAME>` (D1/KV/R2/secrets/vars).
- Web Crypto API (`crypto.subtle`).
- Edge-compatible npm-пакеты.

Запрещено:
- Node API (см. `edge-compat.md`).
- Импорт серверного кода из `components/public` или
  `components/app` (всё через явные API-эндпоинты).

## Schema

Пути:
- `schema/**`

Только миграции и reference-схема. См. `agents/schema.md`.

## Cross-boundary changes

- API-контракт `src/pages/api/<route>` ↔ потребитель в `app/` —
  допустим как явный handoff между `pages-ssr` и `astro-app`.
- Никакая бизнес-логика не дублируется между `public/` и `app/`.
- Любое изменение `wrangler.toml` или `astro.config.mjs` —
  через `pages-ssr`.
