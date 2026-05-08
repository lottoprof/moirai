# Forbidden (moirai)

## Стек и runtime

- Не использовать Node API в runtime-коде (`fs`, `path`, `process`,
  `child_process`, Node `crypto`, `Buffer` без polyfill и т.п.).
  См. `edge-compat.md`.
- Не читать `process.env.<NAME>` в runtime — биндинги доступны
  только через `Astro.locals.runtime.env`.
- Не использовать `client:*` директивы в публичном слое
  (`src/pages/[locale]/*.astro` без `dashboard/`,
  `src/components/public/**`).
- Не подмешивать UI-фреймворки (React/Vue/Svelte/...) в публичный
  слой.
- Не использовать ORM (Drizzle/Prisma и т.п.) — только нативный
  D1 binding (`env.DB.prepare(...).bind(...)`). См. ADR
  2026-05-08 в `decisions.md`.

## Anti-hardcode (Architecture v0.8.1 §4)

Содержание продукта живёт в Content Collections и D1, не в
шаблонах. На pre-commit запущен regex-блокер; reviewer проверяет
вручную.

- Никаких **цен** в шаблонах (`\$\d+`, `[€£¥₽]\d+`). Цены в
  Content Collections (`programmes/[id].mdx` → `tiers[].base_price_amount`,
  `bundles/[id].mdx`) и в D1 (`runs.price_amount`).
- Никаких **количеств модулей/сессий** свободным текстом — только
  через компонент `<Fact source="programme:[id]" field="..." />`.
- Никаких **захардкоженных meta-тегов** (`title`, `description`)
  свободной строкой — только из frontmatter Content Collection или
  через i18n-словарь.
- Никаких **дублирующихся id** между `src/content/programmes/` и
  `src/content/bundles/` (один URL namespace `/{locale}/[id]`).
- Никакого **дублирования "What's Included"** свободным текстом —
  только компонент `<TierFeatures />`.
- Schema.org JSON-LD генерируется компонентами
  (`<CourseSchema>`, `<OfferSchema>`), не вручную.

## Cloudflare и wrangler

- Не править вручную сгенерированные файлы (`worker-configuration.d.ts`,
  `.wrangler/`, `dist/`).
- Не коммитить `.wrangler/`, `dist/`, `.dev.vars`, `node_modules/`.
- Не выполнять `pnpm exec wrangler pages deploy` без явного
  запроса пользователя (production-action).
- Не запускать `pnpm exec wrangler d1 migrations apply --remote`
  или `wrangler d1 execute --remote --file=...` против prod-базы
  без явного подтверждения.
- Не смешивать `pnpm` и `npm`/`yarn` — это сломает
  `pnpm-lock.yaml`.

## Локализация

- Не создавать публичные страницы без префикса локали
  (`prefixDefaultLocale: true`).
- Не создавать контентные записи без перевода во все активные
  локали (без явного `monolingual: true` в frontmatter).
- Не использовать `[locale]` префикс в `/admin/**` или `/api/**`.

## Секреты

- Не хранить секреты, токены и API-ключи в `astro.config.mjs`,
  `wrangler.toml`, `package.json` или коде.
- Не читать и не редактировать `.env` / `.dev.vars` через агентов
  напрямую — это операции пользователя или wrangler-команды.
- Не логировать секреты, заголовки авторизации, тела запросов с
  чувствительными данными.

## Архитектура и границы

- Не нарушать границы зон public / dashboard / admin / server /
  content / schema (см. `boundaries.md`).
- Не дублировать бизнес-логику между публичным слоем, dashboard
  и admin.
- Не модифицировать committed миграции (`migrations/NNNN_*.sql`).
  Изменение схемы — новый файл с следующим номером.
- Не отдавать приватные R2-ключи прямой ссылкой — только через
  `/api/media/[type]/[id]` + `resolveAndAuthorize`.

## Документы и решения

- Не описывать недоказанное поведение инструментов как
  гарантированное.
- Не расходиться по placement компонентов, ролям зон и потокам
  данных между документами.
- Не менять утверждённую структуру в процессе прохождения тестов;
  весь код обязан соответствовать best practices, а проверки —
  выявлять отклонения.

## Скоп изменений

- Не «улучшать» соседний код, комментарии, форматирование, если
  это не требуется задачей.
- Не вводить абстракции под одно использование.
- Не добавлять флаги и configurability, которые не были запрошены.
