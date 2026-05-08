# js-ts: deps

Управление зависимостями в `package.json`.

## Менеджер пакетов

**pnpm** — канонический (см. `decisions.md`, ADR от 2026-05-08).
`pnpm-lock.yaml` коммитится. Не смешивать с `npm` / `yarn`.

## Установка

```bash
pnpm install                # все зависимости из lock
pnpm add <pkg>              # runtime-зависимость
pnpm add -D <pkg>           # dev-зависимость
pnpm add <pkg>@^x.y.z       # с явной версией
```

## Baseline (Architecture v0.8.1 §12)

Runtime:

- `astro`, `@astrojs/cloudflare`, `@astrojs/mdx`, `@astrojs/sitemap`
- `vidstack`
- `zod`
- `aws4fetch` (presigned URL для R2)
- `resend` (transactional email)

Dev:

- `wrangler`, `@cloudflare/workers-types`
- `typescript`, `eslint`, `@typescript-eslint/*`, `eslint-plugin-astro`
- (опц.) `vitest`, `@cloudflare/vitest-pool-workers`,
  `playwright` / `@playwright/test`

## Edge-compatibility check (обязательно перед установкой runtime-deps)

Перед `pnpm add <pkg>` — проверить, что пакет совместим с
Cloudflare Workers runtime:

1. Документация пакета упоминает workerd / edge / Cloudflare
   Workers / Vercel Edge / Deno?
2. В `package.json` пакета есть `exports` с условиями `"workerd"`,
   `"edge-light"`, `"worker"`?
3. Пакет не тащит `fs` / `path` / `process` / Node `crypto`?

Если хотя бы одно «нет» — не ставить в runtime. Допустимы только в
build-time зависимостях (`astro.config.mjs`).

См. `rules/edge-compat.md`.

## Группировка зависимостей

- **runtime** (попадают в bundle Worker'а): astro,
  `@astrojs/cloudflare`, `vidstack`, `zod`, любые edge-compatible
  утилиты.
- **dev**: `wrangler`, `typescript`, `eslint`, `@types/*`,
  `vitest` / `playwright` (если используется).

## Обновление

```bash
pnpm outdated               # что устарело
pnpm update                 # минор-апгрейд по semver
pnpm add <pkg>@latest       # явный апгрейд мажорки (с осторожностью)
```

Мажорный апгрейд `astro`, `@astrojs/cloudflare`, `wrangler` —
отдельная задача с записью в `decisions.md` (если ломает API).

## Pitfalls

1. **Полу-edge пакеты** — заявляют совместимость, но падают на
   первом `fetch`. Проверять на `pnpm wrangler pages dev` до
   коммита.
2. **`@types/*` в runtime** — типы не должны попадать в bundle, но
   ошибочный импорт даёт build error. Держать в `devDependencies`.
3. **Установка без `pnpm-lock.yaml`** — даёт нестабильную сборку.
   Всегда коммитить lock.
4. **Смешение с npm** — сломает `pnpm-lock.yaml`. Не запускать
   `npm install` / `npx <cmd>` в проекте: только `pnpm` /
   `pnpm exec`.
