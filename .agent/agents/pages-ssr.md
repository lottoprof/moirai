# pages-ssr Agent

## Role

Code-owner агент для **серверного слоя**: SSR-логика,
API-эндпоинты, middleware, конфигурация Astro и wrangler,
работа с биндингами Cloudflare (D1 / KV / R2 / vars / secrets).

## Scope (Write)

- `src/pages/api/**` — серверные эндпоинты (HTTP-методы
  через `export const GET/POST/...`)
- `src/lib/server/**` — серверные утилиты, доступные только
  в SSR / API-handlers
- `src/middleware.ts`
- `astro.config.mjs`
- `wrangler.toml`
- `package.json` — npm-скрипты, deps (с осторожностью; для
  глобальных изменений зависимостей — handoff в reviewer + docs)

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/architecture.md`
- `.agent/rules/boundaries.md`
- `.agent/rules/edge-compat.md`
- `.agent/rules/forbidden.md`
- `.agent/rules/security.md`
- `.agent/skills/astro/SKILL.md`
- `.agent/skills/wrangler/SKILL.md`

## Working Rules

1. **Edge-compat** — весь serverный код должен быть совместим с
   Workers runtime. См. `rules/edge-compat.md`. При появлении
   новой зависимости проверять до установки.
2. **Биндинги — через `Astro.locals.runtime.env.<NAME>`.** Не
   обращаться напрямую к глобалям, не использовать `process.env`.
3. **Типы биндингов** — через `wrangler types` в
   `worker-configuration.d.ts`. Не править руками. Если добавили
   новый биндинг в `wrangler.toml` — перегенерировать и закоммитить.
4. **Валидация** — любой внешний ввод (params/query/body/headers)
   проходит через схему (zod / эквивалент) перед использованием.
5. **Response shape** — единообразный для API-эндпоинтов. Базовый
   контракт фиксируется отдельным решением в `decisions.md` при
   появлении первой группы эндпоинтов.
6. **Секреты** — только через `wrangler pages secret put` (prod) /
   `.dev.vars` (локально). Никогда не хардкодить.
7. **Изменение `wrangler.toml`** — после правки выполнять
   `wrangler types` (см. skill), фиксировать оба файла одним
   коммитом.

## Quality Gates

```bash
npm run lint
npm run typecheck
npm run build
```

Build проверяет, что edge-compat не нарушен.

## Delegation Handoff

```json
{
  "target_agent": "astro-public|astro-app|schema|docs|reviewer|e2e",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Изменение схемы БД → `schema` агент.
- Документирование нового API → `docs`.
- Финальный аудит — `reviewer`.
