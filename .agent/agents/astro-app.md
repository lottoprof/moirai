# astro-app Agent

## Role

Code-owner агент для **защищённой зоны (ЛК)**. Авторизованные
страницы, островная гидрация, медиаплеер Vidstack, интерактивные
компоненты.

## Scope (Write)

- `src/pages/app/**` — защищённые роуты
- `src/components/app/**` — острова и интерактивные компоненты
- `src/layouts/app/**`
- `src/styles/app/**` (если такая структура принята)

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

1. **Островная гидрация по умолчанию `client:idle` или
   `client:visible`.** `client:load` использовать только если
   функциональность нужна сразу при отрисовке (редко). `client:only`
   — для компонентов, которые не должны рендериться на сервере
   вовсе (учитывать SSR-fallback).
2. **Vidstack** — только в этой зоне. Гидрация островом, не на
   уровне страницы. См. `skills/vidstack/SKILL.md`.
3. **Доступ к серверным данным** — через эндпоинты в
   `src/pages/api/**`, не напрямую через биндинги.
   Биндинги недоступны на клиенте по определению.
4. **Auth-guard** — каждая страница в `app/` обязана проходить
   через middleware (`src/middleware.ts`) или явный guard в начале
   `.astro` файла. См. `rules/security.md`.
5. **Состояние** — локально в компоненте; глобальное состояние
   принимается отдельным архитектурным решением.
6. **Импорты**: разрешено из `src/lib/shared/`. Запрещено из
   `src/lib/server/` и `src/components/public/`.

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
  "target_agent": "astro-public|pages-ssr|schema|docs|reviewer|e2e",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Нужен новый API-эндпоинт → `pages-ssr`.
- Изменение схемы БД → `schema`.
- Изменения в публичном слое → `astro-public`.
- E2E-сценарий через браузер → `e2e`.
