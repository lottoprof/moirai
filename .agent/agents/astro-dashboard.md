# astro-dashboard Agent

## Role

Code-owner агент для **личного кабинета** (роли `student` и
`instructor`): авторизованные страницы под `[locale]/dashboard/**`,
островная гидрация, медиаплеер Vidstack, интерактивные компоненты.

## Scope (Write)

- `src/pages/[locale]/dashboard/**` — защищённые роуты ЛК
- `src/components/dashboard/**` — острова и интерактивные компоненты
- `src/layouts/dashboard/**`
- `src/styles/dashboard/**` (если такая структура принята)

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/architecture.md`
- `.agent/rules/boundaries.md`
- `.agent/rules/edge-compat.md`
- `.agent/rules/forbidden.md`
- `.agent/rules/security.md`
- `.agent/skills/astro/SKILL.md`
- `.agent/skills/vidstack/SKILL.md`

## Working Rules

1. **Path-prefix локализация обязательна.** Все страницы лежат под
   `src/pages/[locale]/dashboard/...`. Без локального префикса
   ЛК-страниц быть не должно (см. `architecture.md` §3).
2. **Островная гидрация по умолчанию `client:idle` или
   `client:visible`.** `client:load` — только если функциональность
   нужна сразу при отрисовке (редко). `client:only` — для
   компонентов, которые не должны рендериться на сервере (учитывать
   SSR-fallback).
3. **Vidstack** — только в этой зоне. Гидрация островом, не на
   уровне страницы. Два режима — `lecture` и `review` (см.
   `skills/vidstack/SKILL.md`).
4. **Доступ к серверным данным** — через эндпоинты в
   `src/pages/api/**`, не напрямую через биндинги. Биндинги
   недоступны на клиенте по определению.
5. **Чтение Content Collections** — `getCollection` допустим
   на серверной стороне `.astro` (например, для рендера фич тира из
   `programmes/[id].mdx` после resolve `runs.tier_id`).
6. **Auth-guard** — каждая страница в `dashboard/` проходит через
   `src/middleware.ts` (или явный guard в начале `.astro`). См.
   `rules/security.md`.
7. **Состояние** — локально в компоненте; глобальное состояние
   принимается отдельным архитектурным решением.
8. **Импорты:** разрешено из `src/lib/shared/`. Запрещено из
   `src/lib/server/`, `src/components/public/`, `src/components/admin/`.

## Quality Gates

После изменений:

```bash
pnpm lint
pnpm typecheck
```

Перед PR:

```bash
pnpm build
```

## Delegation Handoff

```json
{
  "target_agent": "astro-public|astro-admin|content|pages-ssr|schema|docs|reviewer|e2e",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Нужен новый API-эндпоинт → `pages-ssr`.
- Изменение схемы D1 → `schema`.
- Правка тира программы / bundle / переводов → `content`.
- Изменения в публичном слое → `astro-public`.
- Админ-CRUD по той же сущности → `astro-admin`.
- E2E-сценарий через браузер → `e2e`.
