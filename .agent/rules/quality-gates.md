# Quality Gates (moirai)

Менеджер пакетов — **pnpm** (см. `decisions.md` от 2026-05-08).

## После любых изменений в коде

```bash
pnpm lint
```

ESLint с конфигом проекта. Не игнорировать предупреждения через
`// eslint-disable-*` без комментария-обоснования.

## Перед завершением задачи

```bash
pnpm typecheck
```

`astro check` проходит по `.astro` / `.ts` / `.tsx`. Опирается на
типы биндингов из `worker-configuration.d.ts` — если их нет, сначала
`pnpm exec wrangler types` (см. `skills/wrangler/SKILL.md`).

## Перед commit / push

```bash
pnpm build
```

`astro build` под `@astrojs/cloudflare`. Артефакты в `dist/`. Если
build падает — фиксить, не коммитить.

## Дополнительно

- **Тесты** (если настроены): `pnpm test` (vitest) или эквивалент —
  см. `skills/js-ts/test.md`.
- **E2E**: `pnpm exec playwright test` или прогон через Playwright
  MCP агентом `e2e` против `pnpm wrangler pages dev`.

## ESLint != type checker

ESLint не считается заменой `astro check` / `tsc`. Типы валидируются
только через TypeScript. Lint — стиль, очевидные ошибки, плагин-правила.
