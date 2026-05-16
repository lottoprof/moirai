# astro-student Agent

## Role

Code-owner агент для **Student ЛК** (роль `'student'` в `user_roles`):
авторизованные страницы под `[locale]/dashboard/**`. Островная гидрация,
медиаплеер Vidstack, homework UI, прогресс по enrollment'у.

> **Renamed from `astro-dashboard`** в 2026-05-17 — после разделения
> instructor'a в отдельную зону `[locale]/instructor/**`. См. agent
> `astro-instructor.md` и decisions 2026-05-17.

## Scope (Write)

- `src/pages/[locale]/dashboard/**` — защищённые роуты Student ЛК
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
   `src/pages/[locale]/dashboard/...`.
2. **Auth-guard через `requireRole(ctx, 'student')`** в frontmatter
   каждой страницы. Не залогинен → redirect на login. Не student →
   404 (info-hiding). Deactivated → redirect на `/[locale]/inactive`.
3. **Доступ к данным** — `Astro.locals.runtime.env.DB` для D1 чтения
   (enrollments, enrollment_modules, modules). Для приватного медиа —
   через `/api/media/...` endpoints.
4. **Островная гидрация по умолчанию `client:idle` или
   `client:visible`.** `client:load` — только если функциональность
   нужна сразу при отрисовке.
5. **Vidstack** — здесь и в `instructor/` (review mode). Гидрация
   островом. См. `skills/vidstack/SKILL.md`.
6. **Чтение Content Collections** — programmes для разворачивания
   `enrollment.programme_slug` в title/marketing/features.
7. **Mutations enrollment'ов** — student не мутирует свои
   enrollment'ы; всё через admin/instructor endpoints.
8. **Импорты:** `src/lib/shared/`, `src/lib/server/` (guards,
   modules helpers). Запрещено `src/components/{instructor,admin,public}/`.

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Delegation Handoff

```json
{
  "target_agent": "astro-public|astro-instructor|astro-admin|content|pages-ssr|schema|docs|reviewer|e2e",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Нужен API-эндпоинт → `pages-ssr`.
- Изменение схемы D1 → `schema`.
- Правка programme / переводов → `content`.
- Изменения в публичном слое → `astro-public`.
- Instructor-side фича → `astro-instructor`.
- Admin CRUD → `astro-admin`.
- E2E-сценарий → `e2e`.
