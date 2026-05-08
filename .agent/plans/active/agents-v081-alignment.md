# Agents v0.8.1 Alignment — Stage 3+

## Context

После stage1 (pnpm) и stage2 (rules align) `boundaries.md` уже ссылается
на агентов, которых физически нет в `.agent/agents/`:

- `agents/astro-dashboard.md` — owner `[locale]/dashboard/**` (нет файла)
- `agents/astro-admin.md` — owner `/admin/**` (нет файла)
- `agents/content.md` — owner `src/content/**` (нет файла)

Существующие файлы рассинхронизированы с Architecture v0.8.1:

- `astro-app.md` — описывает `src/pages/app/**` (старый namespace, должен
  быть `[locale]/dashboard/**`)
- `astro-public.md` — описывает `src/pages/*.astro` без `app/` (должно
  быть `[locale]/*.astro` без `dashboard/`)
- `schema.md` — описывает `schema/migrations/` (по v0.8.1 путь
  `migrations/` top-level, плюс `db/types.ts`)
- `pages-ssr.md` — не упоминает `db/types.ts` и `src/content/config.ts`
- `AGENTS.md` (=`CLAUDE.md` через симлинк) — старый список агентов

Цель stage 3+: привести ростер `.agent/agents/` и упоминания в
`AGENTS.md` к Architecture v0.8.1 + `boundaries.md`.

## Принципы

1. **Read-only по зонам.** Никаких правок `docs/Architecture.md`,
   `rules/architecture.md`, `rules/boundaries.md` — они источник истины
   и уже выровнены.
2. **`git mv` для переименований** — сохранить историю.
3. **Агентский файл ≤ 100 строк** (размер существующих).
4. **Один логический change = один commit.**
5. **CLAUDE.md → симлинк на AGENTS.md** — менять только AGENTS.md.

## Изменения

### 1. `astro-app.md` → `astro-dashboard.md`

`git mv .agent/agents/astro-app.md .agent/agents/astro-dashboard.md` +
правка:

- Role: ЛК для `student` / `instructor` (не просто "защищённая зона")
- Scope (Write):
  - `src/pages/[locale]/dashboard/**`
  - `src/components/dashboard/**`
  - `src/layouts/dashboard/**`
  - `src/styles/dashboard/**` (если структура принята)
- Working Rules: упомянуть `[locale]` в путях, чтение Content
  Collections для tier features через `getCollection`, импорт из
  `src/lib/shared/`
- Запрещено: импорт из `src/lib/server/`, `src/components/public/`,
  `src/components/admin/`
- Delegation list: `astro-public|astro-admin|content|pages-ssr|schema|docs|reviewer|e2e`

### 2. NEW: `astro-admin.md`

Скаффолд по образцу `astro-dashboard.md`:

- Role: внутренний CRUD-инструмент для `users.role = 'admin'`
- Scope (Write):
  - `src/pages/admin/**` — **без локали**
  - `src/components/admin/**`
  - `src/layouts/admin/**`
- Working Rules:
  - `/admin/**` — без префикса локали (внутренний инструмент)
  - Auth-guard через `src/middleware.ts` (role=admin)
  - CRUD UI поверх API-эндпоинтов; прямые мутации D1/R2/KV запрещены
  - Islands допускаются (формы, таблицы)
- Read First: `architecture.md`, `boundaries.md`, `security.md`,
  `forbidden.md`, `astro/SKILL.md`
- Delegation: `pages-ssr|schema|content|docs|reviewer|e2e`

### 3. NEW: `content.md`

Скаффолд под Content Collections:

- Role: владелец `src/content/**` (programmes, bundles, instructors,
  segments, pages, journal, works, voice-guide) и `drafts/`
- Scope (Write):
  - `src/content/programmes/**` — `[id].{locale}.mdx` + tiers
  - `src/content/bundles/**` — `[id].{locale}.mdx` + `includes_programmes`
  - `src/content/instructors/**`, `segments/**`, `pages/**`,
    `journal/**`, `works/**`
  - `src/content/voice-guide.md`
  - `drafts/**` (agent journal pipeline, вне `src/`)
- Запрещено:
  - Изменение `src/content/config.ts` (zod schemas) — handoff в `pages-ssr`
  - Изменение страниц / компонентов / Astro-конфигов
  - Дублирование id между `programmes/` и `bundles/` (один URL namespace)
  - Хардкод цен/чисел вне frontmatter полей tier
- Working Rules:
  - Translation pairs: каждый объект во всех активных локалях, или
    явный `monolingual: true`
  - Build-time validation падает на разрыв translation pair или
    дублирование id
- Delegation: `pages-ssr|astro-public|astro-dashboard|docs`

### 4. `astro-public.md` — точечная правка

- Scope (Write): заменить `src/pages/*.astro` (без `app/`) на
  `src/pages/[locale]/*.astro` (без `dashboard/`)
- Импорты: добавить запрет на `src/components/dashboard/` и
  `src/components/admin/`
- Delegation list: добавить `astro-dashboard|astro-admin|content|...`

### 5. `pages-ssr.md` — точечная правка

- Scope (Write): добавить
  - `src/content/config.ts` — zod-схемы Content Collections
  - `db/types.ts` — ручные TS-типы D1 (атомарно с миграциями;
    координация со `schema`)
- Working Rules:
  - Упомянуть `[locale]` для path-prefix routing
  - Уточнить, что `db/types.ts` обновляется одновременно с миграциями
    (через handoff `schema → pages-ssr`)
- Delegation list: `astro-public|astro-dashboard|astro-admin|content|schema|docs|reviewer|e2e`

### 6. `schema.md` — точечная правка

- Scope (Write):
  - `migrations/NNNN_<description>.sql` — **top-level**, не
    `schema/migrations/`
- Working Rules:
  - Применение через `wrangler d1 migrations create/apply` (а не
    `wrangler d1 execute --remote --file=...` напрямую)
  - После миграции — handoff в `pages-ssr` для обновления
    `db/types.ts`
- Удалить упоминание `schema/<name>.sql` (reference-схемы — нет
  такого слоя в v0.8.1, единственный источник — `migrations/` +
  `db/types.ts`)

### 7. `docs.md`, `reviewer.md`, `e2e.md` — точечные правки

- В `Delegation Handoff` JSON: расширить перечень
  `target_agent` до полного ростера v0.8.1.
- `reviewer.md` чек-лист boundaries: упомянуть три UI-слоя
  (`public` / `dashboard` / `admin`) вместо двух (`public` / `app`).

### 8. `AGENTS.md` (он же `CLAUDE.md` через симлинк)

- `PROJECT AGENT MAP`: переписать под новый ростер
  - `astro-public` — `src/pages/[locale]/*.astro` (без `dashboard/`),
    `components/public/**`, `layouts/public/**`
  - `astro-dashboard` — ЛК, `src/pages/[locale]/dashboard/**`,
    `components/dashboard/**`, Vidstack islands
  - `astro-admin` — `/admin/**` без локали, role=admin, CRUD
  - `content` — `src/content/**`, `drafts/**`
  - `pages-ssr` — `src/pages/api/**`, `src/lib/server/**`,
    `src/middleware.ts`, `astro.config.mjs`, `wrangler.toml`,
    `src/content/config.ts`, `db/types.ts`
  - `schema` — `migrations/**` (top-level), коммитнутые миграции
    immutable
  - `docs` — `docs/**`, `wiki/**`, `README.md`
  - `reviewer` — read-only ревью
  - `e2e` — Playwright MCP против `wrangler pages dev` / preview
- `DELEGATION PROTOCOL` JSON enum: расширить
  `astro-public|astro-dashboard|astro-admin|content|pages-ssr|schema|docs|reviewer|e2e`

### 9. `decisions.md` + `decisions_archive.md`

Запись `2026-05-08` — Agent roster v0.8.1: добавлены
`astro-dashboard` (replaces `astro-app`), `astro-admin`, `content`;
schema migrations переехали в `migrations/` top-level + `db/types.ts`.

## Этапы и git-коммиты

Один коммит = один логический change.

1. **stage3a:** `git mv astro-app.md astro-dashboard.md` + правка
   контента → commit `agents: rename astro-app → astro-dashboard for v0.8.1 layout`.
2. **stage3b:** Создать `agents/astro-admin.md` и `agents/content.md`
   → commit `agents: add astro-admin and content owners (v0.8.1)`.
3. **stage3c:** Точечные правки `astro-public.md`, `pages-ssr.md`,
   `schema.md`, `docs.md`, `reviewer.md`, `e2e.md` → commit
   `agents: align existing roster with v0.8.1 boundaries`.
4. **stage3d:** Обновить `AGENTS.md` (PROJECT AGENT MAP +
   DELEGATION PROTOCOL enum) → commit
   `AGENTS: refresh agent map and delegation enum for v0.8.1`.
5. **stage3e:** Запись в `decisions.md` + полное тело в
   `decisions_archive.md` → commit
   `decisions: record agent roster v0.8.1 alignment`.

## Verification

После каждого этапа:

```bash
# нет битых ссылок на старых агентов вне archive/done
grep -rn "astro-app" .agent/ \
  --exclude-dir=plans/done \
  --exclude=decisions_archive.md
# должен вернуть только этот план (active/agents-v081-alignment.md)

# нет упоминаний schema/migrations вне archive/done
grep -rn "schema/migrations" .agent/ \
  --exclude-dir=plans/done

# каждый файл ≤ 100 строк
wc -l .agent/agents/*.md
```

После всего:

```bash
ls .agent/agents/
# astro-public.md  astro-dashboard.md  astro-admin.md  content.md
# pages-ssr.md  schema.md  docs.md  reviewer.md  e2e.md

grep -rn "astro-app\|src/pages/app" .agent/ \
  --exclude-dir=plans \
  --exclude=decisions_archive.md
# должен быть пустым
```

## Out of scope

- Создание реальных `src/`, `migrations/`, `db/types.ts` — это работа
  следующих stage (Sprint 0).
- Правки `docs/Architecture.md`, `rules/architecture.md`,
  `rules/boundaries.md` — они источник истины, уже выровнены в stage2.
- План `plans/active/instructions-rewrite.md` — отдельный вопрос
  (нужно перенести в `plans/done/`, но не в этой задаче).

## Critical files to modify

- `/home/az/git/moirai/.agent/agents/astro-app.md` → `astro-dashboard.md` (rename)
- `/home/az/git/moirai/.agent/agents/astro-admin.md` (NEW)
- `/home/az/git/moirai/.agent/agents/content.md` (NEW)
- `/home/az/git/moirai/.agent/agents/{astro-public,pages-ssr,schema,docs,reviewer,e2e}.md`
- `/home/az/git/moirai/.agent/AGENTS.md`
- `/home/az/git/moirai/.agent/rules/decisions.md`
- `/home/az/git/moirai/.agent/rules/decisions_archive.md`
