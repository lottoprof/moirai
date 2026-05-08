# js-ts: test

Тестовый стек проекта определяется отдельным решением в
`decisions.md`. По умолчанию (если выбрано):

- **Юнит / интеграционные** — Vitest.
- **E2E / browser** — Playwright (через MCP — `agents/e2e.md`, или
  как тест-раннер в `tests/e2e/`).

## Vitest (если используется)

```bash
pnpm test                   # vitest run
pnpm test -- --watch        # watch mode
pnpm test -- <pattern>      # фильтр по имени
```

Конфиг: `vitest.config.ts`. Окружение для Astro-кода обычно
`happy-dom` или `jsdom`. Для серверного кода с биндингами —
`@cloudflare/vitest-pool-workers` (даёт реальный workerd, а не
эмуляцию):

```ts
// vitest.config.ts (если использует workers-pool)
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" }
      }
    }
  }
});
```

## Структура тестов

```
tests/
├── unit/              # vitest, изолированные модули
├── integration/       # vitest + workers-pool, биндинги
└── e2e/               # playwright, browser
```

Не ставить тесты в `src/`. Производственный bundle не должен
тащить тестовые зависимости.

## Playwright (если используется)

```bash
pnpm exec playwright test
pnpm exec playwright test --headed
pnpm exec playwright test --debug
pnpm exec playwright show-report
```

Конфиг: `playwright.config.ts`. baseURL — локальный
`wrangler pages dev` или preview-deploy.

## Coverage

```bash
pnpm test -- --coverage
```

Не ставить целевой % покрытия как формальное требование без
обоснования. Лучше — конкретные user paths и edge-cases.

## Pitfalls

1. **Vitest без workers-pool** — не имитирует биндинги. Для тестов
   серверной логики нужен `@cloudflare/vitest-pool-workers`,
   иначе `Astro.locals.runtime.env` будет undefined.
2. **Playwright против `astro dev`** — может быть нестабильно из-за
   HMR. Запускать против `pnpm build && pnpm wrangler pages dev` или
   против preview-URL.
3. **Тестовые секреты** — в `.dev.vars`, не в `.env`. Никогда не в
   commit.
