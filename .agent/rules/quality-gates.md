# Quality Gates (moirai)

## После любых изменений в коде

```bash
npm run lint
```

ESLint с конфигом проекта. Не игнорировать предупреждения через
`// eslint-disable-*` без комментария-обоснования.

## Перед завершением задачи

```bash
npm run typecheck
```

`astro check` проходит по `.astro` / `.ts` / `.tsx`. Опирается на
типы биндингов из `worker-configuration.d.ts` — если их нет, сначала
`wrangler types` (см. `skills/wrangler/SKILL.md`).

## Перед commit / push

```bash
npm run build
```

`astro build` под `@astrojs/cloudflare`. Артефакты в `dist/`. Если
build падает — фиксить, не коммитить.

## Дополнительно

- **Тесты** (если настроены): `npm test` (vitest) или эквивалент —
  см. `skills/js-ts/test.md`.
- **E2E**: `npx playwright test` или прогон через Playwright MCP
  агентом `e2e` против `wrangler pages dev`.

## ESLint != type checker

ESLint не считается заменой `astro check` / `tsc`. Типы валидируются
только через TypeScript. Lint — стиль, очевидные ошибки, плагин-правила.
