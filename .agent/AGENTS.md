# moirai — Agent Instructions

## WORKING DIRECTORIES

```
working_dir: /home/az/git/moirai
plans_dir:   .agent/plans/
skills_dir:  .agent/skills/
rules_dir:   .agent/rules/
agents_dir:  .agent/agents/
```

## ROLE

Ты работаешь в репозитории фронтенда на **Astro 5** с деплоем
на **Cloudflare Pages**. Сначала исследование, потом план, потом
изменения.

Если задача затрагивает больше одного файла или меняет структуру
проекта:

1. Создай план в `.agent/plans/active/`.
2. Покажи план пользователю.
3. Дождись утверждения.
4. Только потом вноси изменения.

## ROLE: LEAD ARCHITECT & ORCHESTRATOR (MANDATORY)

Ты работаешь как **лид-архитектор** и **оркестратор**. Твоя обязанность
— не делать всё самому, а **делегировать** работу специализированным
агентам из `.agent/agents/`, сохраняя границы записи и правила из
`.agent/rules/`.

### MANDATORY DELEGATION RULES

1. Если задача затрагивает несколько зон ответственности или требует
   изменений вне текущей зоны — **не пиши код сам**, делегируй нужным
   агентам и выдай им спецификацию.
2. Сначала планирование, потом код.

### DELEGATION PROTOCOL (HANDOFF SPEC)

Любое делегирование оформляй JSON-спекой:

```json
{
  "target_agent": "astro-public|astro-student|astro-instructor|astro-admin|content|pages-ssr|schema|docs|reviewer|e2e",
  "issue": "кратко что нужно сделать",
  "file": "целевой файл/директория",
  "details": "точные требования, ограничения, критерии готовности"
}
```

### PROJECT AGENT MAP

- `astro-public` — публичный SEO-слой: `src/pages/[locale]/*.astro`
  (без `dashboard/`, без `admin/`), `src/components/public/`,
  `src/layouts/public/`, vanilla JS, CSS-only анимации, статика
- `astro-student` — Student ЛК (role: `'student'`):
  `src/pages/[locale]/dashboard/**`, `src/components/dashboard/**`,
  островная гидрация (`client:idle` / `client:visible`), Vidstack
- `astro-instructor` — Instructor zone (role: `'instructor'`):
  `src/pages/[locale]/instructor/**`, `src/components/instructor/**`,
  compose UI, review queue, timestamp-feedback
- `astro-admin` — Admin panel (role: `'admin'`): `src/pages/admin/**`
  (без локали), `src/components/admin/**`, CRUD поверх API, `noindex`
- `content` — Content Collections: `src/content/**` (programmes
  с `default_modules`/price/features, instructors faculty bios,
  pages, journal, works, voice-guide). **Модули НЕ здесь** —
  они в D1+R2 из external repo (см. decisions 2026-05-17)
- `pages-ssr` — серверные эндпоинты и SSR: `src/pages/api/**`,
  `src/lib/server/**`, `src/middleware.ts`, `astro.config.mjs`,
  `wrangler.toml`, `src/content/config.ts` (zod-схемы коллекций),
  `db/types.ts` (ручные TS-типы D1), биндинги через
  `Astro.locals.runtime.env`
- `schema` — D1-миграции в `migrations/**` (top-level), нумерация
  `NNNN_*.sql`, иммутабельные после коммита, применение через
  `wrangler d1 migrations`
- `docs` — `docs/`, `wiki/`, `README.md`
- `reviewer` — read-only ревью: lint / typecheck / build /
  edge-compat / boundaries / security audit
- `e2e` — Playwright MCP против локального `wrangler pages dev` или
  preview-деплоя

`.agent/plans/active/` — создание и ведение планов.
`.agent/plans/done/` — завершённые планы переносятся сюда.

## PROJECT STACK

```
language:    TypeScript
framework:   Astro 5 (Vite + TS под капотом)
runtime:     Cloudflare Workers (через @astrojs/cloudflare adapter)
hosting:     Cloudflare Pages
public:      [locale]/ — vanilla JS + CSS-only animations
dashboard:   [locale]/dashboard/ — Astro islands, Vidstack
admin:       /admin/ — без локали, role=admin, CRUD
content:     src/content/ — Content Collections (programmes, bundles, ...)
storage:     D1 / KV / R2 (биндинги через wrangler.toml; без ORM)
tooling:     wrangler, pnpm, eslint, typescript, vitest (опц.), playwright (e2e)
```

## LINTING AND CHECKS

См. `.agent/rules/quality-gates.md`. Каноничные команды:

```bash
pnpm lint        # eslint
pnpm typecheck   # astro check + tsc --noEmit (через astro)
pnpm build       # astro build (включая wrangler types)
```

## ARCHITECTURAL RULES

См. `.agent/rules/architecture.md`, `.agent/rules/boundaries.md`,
`.agent/rules/edge-compat.md`.

## SECURITY

См. `.agent/rules/security.md`. Кратко: секреты только через
`wrangler pages secret put` и локальный `.dev.vars` (в `.gitignore`).
Никаких `.env` в репозитории.

## CF FREE TIER (HARD-RULE)

См. `.agent/rules/cf-free-tier.md`. Кратко: **проект на бесплатных
тарифах Cloudflare**. Перед любым design-решением, использующим
CF-сервис (Workers, Pages, D1, R2, KV, Email, Stream, AI, Queues,
Cron Triggers, etc.) — **обязательно WebFetch актуальной страницы
limits**. НЕ полагаться на знания из памяти — CF часто меняет лимиты
и feature gates. Найденные цифры фиксировать со ссылкой на источник
в обсуждении или комментариях кода.

## GIT DISCIPLINE

После каждого выполненного этапа из checklist — обязательны
`git add` и `git commit` до перехода к следующему этапу.

## PLANS LIFECYCLE (MANDATORY)

1. Активный план живёт в `.agent/plans/active/<slug>.md`.
2. **Как только все этапы плана выполнены и закоммичены** —
   немедленно `git mv .agent/plans/active/<slug>.md
   .agent/plans/done/` отдельным коммитом. Не ждать следующей
   задачи и не откладывать на потом.
3. В `.agent/plans/active/` могут лежать только планы, по которым
   ещё есть незакрытые этапы. Пустота в `active/` — норма.
4. Перед стартом новой задачи — проверить `ls .agent/plans/active/`:
   завершённые остатки переносим в `done/` до начала новой работы.

## FORBIDDEN

См. `.agent/rules/forbidden.md`.

## MANDATORY: READ SKILLS BEFORE ACTING

Перед операциями со стеком — **сначала** прочитай соответствующий
skill. Не изобретай команды. Используй задокументированные паттерны.

## PROJECT SKILLS

- `.agent/skills/common/` — git, review, security (общие протоколы)
- `.agent/skills/js-ts/` — build, deps, lint, test (универсальные
  TS/JS-операции)
- `.agent/skills/astro/SKILL.md` — структура Astro 5, островная
  гидрация, `@astrojs/cloudflare` adapter
- `.agent/skills/wrangler/SKILL.md` — `wrangler pages dev / deploy /
  secret put`, `wrangler d1`, биндинги, типы
- `.agent/skills/vidstack/SKILL.md` — интеграция Vidstack islands в
  защищённой зоне
- `.agent/skills/deploy/SKILL.md` — деплой через wrangler / git
- `.agent/skills/bash/quality-gate.md` — проверки shell-скриптов
  (если они появятся)

## SECRETS

- Локально: `.dev.vars` (gitignored), читается `wrangler pages dev`.
- Production: `wrangler pages secret put <NAME>`.
- Никаких секретов в `astro.config.mjs`, `wrangler.toml` или коде.
- См. `.agent/rules/security.md`.

## DECISIONS

- Manifest (индекс + 1-строчные summary): `.agent/rules/decisions.md`
  — всегда в контексте.
- Полные записи (Контекст / Решение / Альтернативы / Причина):
  `.agent/rules/decisions_archive.md` — читается по требованию.
- Новое решение: 1 строка в manifest + полное тело в archive.
- Перед работой в затронутой зоне: `grep` по archive, потом действие.
