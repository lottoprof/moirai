# Quality Gates (moirai)

Менеджер пакетов — **pnpm** (см. `decisions.md` от 2026-05-08).

## Node version — 22 (MANDATORY)

Проект **требует Node 22**:
- `.nvmrc` → `22`
- `package.json` → `"engines": {"node": ">=22"}`
- `wrangler ≥4.x` требует Node ≥22 (иначе `Wrangler requires Node.js v22.0.0`)

Дев-окружение (Bash в CI / локально / Claude Code) стартует с
системной Node (обычно v20). **Каждая Bash-команда** с `pnpm`,
`npm`, `node`, `wrangler` **начинается с активации Node 22**:

```bash
source ~/.nvm/nvm.sh && nvm use 22 2>/dev/null && <команда>
```

Включает (не ограничивается):
- `pnpm release / build / dev / lint / typecheck / install`
- `pnpm exec wrangler *` (D1, R2, pages deploy, secrets)
- `node scripts/*.mjs`
- `pnpm sync:* / seed:* / publish:*`

**Почему** каждая: `pnpm release` под Node 20 запускает
`prerelease`-hook под Node 20, который `spawnSync('corepack', ...)`
наследует Node 20 → `wrangler` в глубине цепочки видит Node 20 →
падение всей deploy chain (реальный случай 2026-07-03).

Всегда `2>/dev/null` подавляет nvm's engine-mismatch warnings.

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
