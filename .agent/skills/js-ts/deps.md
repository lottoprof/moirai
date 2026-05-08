# js-ts: deps

Управление зависимостями в `package.json`.

## Менеджер пакетов

`npm` — канонический. `package-lock.json` коммитится. Не смешивать
с `pnpm` / `yarn` без отдельного решения.

## Установка

```bash
npm install                # все зависимости из lock
npm i <pkg>                # runtime-зависимость
npm i -D <pkg>             # dev-зависимость
npm i <pkg>@^x.y.z         # с явной версией
```

## Edge-compatibility check (обязательно перед установкой runtime-deps)

Перед `npm i <pkg>` — проверить, что пакет совместим с Cloudflare
Workers runtime:

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
npm outdated               # что устарело
npm update                 # минор-апгрейд по semver
npm i <pkg>@latest         # явный апгрейд мажорки (с осторожностью)
```

Мажорный апгрейд `astro`, `@astrojs/cloudflare`, `wrangler` —
отдельная задача с записью в `decisions.md` (если ломает API).

## Pitfalls

1. **Полу-edge пакеты** — заявляют совместимость, но падают на
   первом `fetch`. Проверять на `wrangler pages dev` до коммита.
2. **`@types/*` в runtime** — типы не должны попадать в bundle, но
   ошибочный импорт даёт build error. Держать в `devDependencies`.
3. **Установка без `package-lock.json`** — даёт нестабильную сборку.
   Всегда коммитить lock.
