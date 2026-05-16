# astro-instructor Agent

## Role

Code-owner агент для **Instructor zone** (роль `'instructor'` в
`user_roles`): авторизованные страницы под `[locale]/instructor/**`.
Review queue homework, MY STUDENTS list, compose UI для модулей
(individual programme setup + extension existing enrollments),
schedule sessions (Sprint 2+).

> Создан в 2026-05-17 — после разделения `[locale]/dashboard/**`
> (был student+instructor) на две зоны. См. decisions 2026-05-17.

## Scope (Write)

- `src/pages/[locale]/instructor/**` — защищённые роуты instructor
- `src/components/instructor/**` — острова (compose UI, review queue,
  feedback editor с timestamp'ами)
- `src/layouts/instructor/**`
- `src/styles/instructor/**` (если такая структура принята)

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/architecture.md`
- `.agent/rules/boundaries.md`
- `.agent/rules/edge-compat.md`
- `.agent/rules/forbidden.md`
- `.agent/rules/security.md`
- `.agent/skills/astro/SKILL.md`
- `.agent/skills/vidstack/SKILL.md`     # review mode

## Working Rules

1. **Path-prefix локализация обязательна.** Все страницы лежат под
   `src/pages/[locale]/instructor/...`.
2. **Auth-guard через `requireRole(ctx, 'instructor')`** в frontmatter
   каждой страницы. Не залогинен → redirect на login. Не instructor →
   404. Deactivated → redirect на `/[locale]/inactive`.
3. **Per-enrollment permissions**: instructor видит/мутирует только
   те enrollment'ы, где он `lead_instructor_id`. Read-only визибилити
   на чужих enrollment'ах через `/api/instructor/enrollments?lead_only=false`
   допускается для co-teaching contexts (read), но мутации запрещены.
4. **Compose UI для модулей** — instructor добавляет/убирает модули
   в enrollment через `/api/instructor/enrollments/[id]/modules`.
   Server auto-resolve'ит `requires_modules` (см. decisions 2026-05-17
   §`requires_modules`).
5. **Vidstack** — review mode для homework видео с timestamp-feedback
   widget'ом. См. `skills/vidstack/SKILL.md`.
6. **Островная гидрация** — `client:idle` / `client:visible` /
   `client:load`. Compose UI и review queue — обычно `client:idle`.
7. **Импорты:** `src/lib/shared/`, `src/lib/server/`. Запрещено
   `src/components/{student,admin,public}/`.

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Delegation Handoff

```json
{
  "target_agent": "astro-public|astro-student|astro-admin|content|pages-ssr|schema|docs|reviewer|e2e",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Нужен API-эндпоинт → `pages-ssr` (с указанием role-guard для
  endpoint: lead-instructor или admin).
- Изменение схемы D1 → `schema`.
- Module-catalogue sync (external repo → D1) — отдельный flow,
  не instructor.
- Admin CRUD на enrollments → `astro-admin`.
- Student-side изменение → `astro-student`.
- E2E-сценарий с двумя ролями → `e2e`.
