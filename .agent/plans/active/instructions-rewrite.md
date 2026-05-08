# Instructions Rewrite — moirai → Astro 5 + Cloudflare

## Context

`/home/az/git/moirai/.agent/` сейчас содержит инструкции от другого
проекта (factory: Python/FastAPI, Docker на hub/forge, tmux, LiteLLM,
film/LangGraph pipeline). Новый стек:

- **Astro 5** (Vite + TS) — публичный SEO-слой и SSR-страницы
- **Cloudflare Pages** + `@astrojs/cloudflare` adapter — деплой статики
  и SSR через CF Workers runtime
- **Vidstack** — медиаплеер в защищённой зоне (ЛК), островная гидрация
- **Vanilla JS + CSS-only анимации** в публичном слое
- **Wrangler** — dev/deploy/secrets/D1/KV/R2 биндинги

Цель: переписать AGENTS.md, rules, agents, skills под новый стек,
сохранив только универсальные принципы (git-дисциплина, делегирование,
review, security как протоколы).

Источник идей для CF-паттернов: `/home/az/git/301` (берём только
лучшее, делаем своё).

## Решения, принимаемые этим планом

1. **Старые active-планы (`plans/active/*`)** — относятся к factory/film,
   к новому проекту неприменимы. **НЕ трогаем** в этой задаче (отдельный
   запрос от пользователя). План `instructions-rewrite.md` живёт в `active/`
   до завершения.
2. **`decisions_archive.md`** — содержит historical decisions factory.
   Архивируем под маркером `# Archive: factory project` (не удаляем — это
   справочный материал), затем стартуем новую секцию для moirai.
3. **Skills `python/`, `service-fastapi/`, `tmux/`** — удаляем (не нужны
   под новый стек).
4. **Skill `deploy/SKILL.md`** — переписываем целиком под `wrangler pages
   deploy` / git-driven deploy (старый файл — про docker/tmux на hub/forge).
5. **Skills `common/git.md`, `common/review.md`, `common/security.md`** —
   сейчас пустые. Заполняем минимальным универсальным содержимым.
6. **Skills `js-ts/build|deps|lint|test`** — сейчас пустые. Заполняем под
   Astro 5 / Vite / TS / wrangler.
7. **Agents** — удаляем `services-python.md` и `scripts-shell.md`.
   Создаём новый набор под зоны фронтенда и CF.
8. **Новые правила** — добавляем `edge-compat.md`, `boundaries.md`,
   `quality-gates.md`, `security.md` (вдохновлено 301, но переформулировано
   под Astro Pages SSR, не под чистые Workers).

## Целевая структура `.agent/`

```
.agent/
├── AGENTS.md                       # переписан: Astro 5 + CF + Wrangler
├── agents/
│   ├── astro-public.md             # NEW: публичный SEO-слой (vanilla, CSS)
│   ├── astro-app.md                # NEW: ЛК, Vidstack, islands
│   ├── pages-ssr.md                # NEW: SSR endpoints, server logic, bindings
│   ├── schema.md                   # NEW: D1 миграции (опц., если будем юзать D1)
│   ├── docs.md                     # переписан под новый стек
│   ├── reviewer.md                 # NEW: read-only ревью + edge-compat audit
│   └── e2e.md                      # NEW: Playwright MCP smoke-тесты
├── plans/
│   ├── roadmap.md                  # переписан под новый проект
│   ├── active/                     # film-планы оставляем как есть
│   └── done/                       # архив factory
├── rules/
│   ├── architecture.md             # переписан: public vs app, SSR, bindings
│   ├── boundaries.md               # NEW: границы public/app/server
│   ├── edge-compat.md              # NEW: запреты в Workers runtime
│   ├── forbidden.md                # переписан под новый стек
│   ├── quality-gates.md            # NEW: lint/typecheck/build команды
│   ├── security.md                 # NEW: wrangler secret, AES-GCM, no .env
│   ├── decisions.md                # очищен от factory; стартовая запись
│   └── decisions_archive.md        # факторские записи под маркером Archive
├── skills/
│   ├── astro/SKILL.md              # NEW: структура Astro 5, islands, adapter
│   ├── wrangler/SKILL.md           # NEW: dev/deploy/secret/d1/kv/r2/tail
│   ├── vidstack/SKILL.md           # NEW: интеграция Vidstack island в ЛК
│   ├── deploy/SKILL.md             # переписан: wrangler pages deploy
│   ├── js-ts/                      # заполнен под Astro/Vite/TS
│   │   ├── build.md
│   │   ├── deps.md
│   │   ├── lint.md
│   │   └── test.md
│   ├── bash/quality-gate.md        # сохранён (универсальный)
│   └── common/                     # заполнен минимальным содержимым
│       ├── git.md
│       ├── review.md
│       └── security.md
├── settings.local.json             # обновлён: wrangler/npm permissions
└── mcp.json                        # без изменений (или Cloudflare MCP)
```

**Удалить:**
- `agents/services-python.md`
- `agents/scripts-shell.md`
- `skills/python/` (директория целиком)
- `skills/service-fastapi/` (директория целиком)
- `skills/tmux/` (директория целиком)

## Project agent map (новый)

- `astro-public` — `src/pages/` без `app/`, `src/components/public/`,
  `src/layouts/public/`, статика, vanilla JS, CSS-only animations, SEO
- `astro-app` — `src/pages/app/`, `src/components/app/`, островная
  гидрация, Vidstack, защищённая зона
- `pages-ssr` — `src/pages/api/`, `src/lib/server/`, `src/middleware.ts`,
  работа с `Astro.locals.runtime.env` (D1/KV/R2 биндинги), `wrangler.toml`,
  `astro.config.mjs`
- `schema` — `schema/migrations/` (если используем D1)
- `docs` — `docs/`, `wiki/`, README
- `reviewer` — read-only, lint/typecheck/build, edge-compat audit
- `e2e` — Playwright MCP против локального `wrangler pages dev` или
  preview-деплоя

## Ключевые архитектурные решения проекта (фиксируем в decisions.md)

1. **Слои.** Публичный слой (SEO) — без JS-фреймворков, только vanilla
   `<script>` или ничего. Защищённая зона (ЛК) — Astro islands с
   `client:idle` / `client:visible`, разрешён Vidstack.
2. **SSR.** `output: "server"` или `"hybrid"` в `astro.config.mjs`,
   adapter `@astrojs/cloudflare`. Конкретный режим выбирается на этапе
   первого скаффолда — фиксируется отдельным решением.
3. **Wrangler.** Канонический инструмент: `wrangler pages dev`,
   `wrangler pages deploy`, `wrangler pages secret put`,
   `wrangler d1 execute` (если D1 используется).
4. **Секреты.** Только через `wrangler pages secret put` (prod) и
   `.dev.vars` локально. `.dev.vars` в `.gitignore`. Никаких `.env` в
   репозитории.
5. **Edge-compat.** Runtime-код (всё, что попадает в Worker) — без Node
   APIs (`fs`, `path`, `process`, `child_process`, `crypto`). Build-time
   (Astro build) — Node API разрешены.
6. **Биндинги.** Доступ через `Astro.locals.runtime.env.<NAME>` (типы
   через `wrangler types`).

## Этапы и git-коммиты

Каждый этап завершается `git add` + `git commit` до перехода к следующему
(по `GIT DISCIPLINE` в AGENTS.md).

1. **Plan published.** Создать `plans/active/instructions-rewrite.md`
   (этот файл) → commit.
2. **Core docs.** Переписать `AGENTS.md`, `rules/architecture.md`,
   `rules/forbidden.md`. Создать `rules/edge-compat.md`,
   `rules/boundaries.md`, `rules/quality-gates.md`, `rules/security.md`.
   → commit.
3. **Decisions reset.** Переписать `rules/decisions.md` (новый manifest);
   архивировать factory-записи в `decisions_archive.md` под маркером.
   → commit.
4. **Agents.** Удалить `agents/services-python.md`, `agents/scripts-shell.md`.
   Переписать `agents/docs.md`. Создать `agents/astro-public.md`,
   `agents/astro-app.md`, `agents/pages-ssr.md`, `agents/schema.md`,
   `agents/reviewer.md`, `agents/e2e.md`. → commit.
5. **Skills.** Удалить `skills/python/`, `skills/service-fastapi/`,
   `skills/tmux/`. Переписать `skills/deploy/SKILL.md`. Создать
   `skills/astro/SKILL.md`, `skills/wrangler/SKILL.md`,
   `skills/vidstack/SKILL.md`. Заполнить `skills/js-ts/*.md` и
   `skills/common/*.md`. → commit.
6. **Settings + roadmap.** Обновить `settings.local.json` (wrangler/npm
   permissions). Переписать `plans/roadmap.md`. → commit.

## Verification

После каждого этапа:
- Файлы существуют по целевой структуре (см. tree выше).
- Внутренние ссылки между файлами не битые (`grep -r "skills/python"`,
  `grep -r "tmux"`, `grep -r "factory"` — должны быть пустыми вне
  `decisions_archive.md` и `plans/{active,done}`).
- Размер каждого файла ≤ 200 строк (агрессивно простые инструкции).

После всего:
- `cat .agent/AGENTS.md | head -20` — стек Astro 5 + CF + Wrangler.
- `ls .agent/agents/` — нет services-python, scripts-shell.
- `ls .agent/skills/` — нет python, service-fastapi, tmux.
- `ls .agent/skills/astro/ .agent/skills/wrangler/ .agent/skills/vidstack/`
  — есть SKILL.md в каждой.

## Open question

`plans/active/*` (7 факторских планов) — оставляю на месте; пользователь
сам решит, переносить ли в `done/` или удалить.

## Critical files to modify

- `/home/az/git/moirai/.agent/AGENTS.md`
- `/home/az/git/moirai/.agent/rules/{architecture,forbidden,decisions,decisions_archive}.md`
- `/home/az/git/moirai/.agent/rules/{edge-compat,boundaries,quality-gates,security}.md` (новые)
- `/home/az/git/moirai/.agent/agents/{docs,astro-public,astro-app,pages-ssr,schema,reviewer,e2e}.md`
- `/home/az/git/moirai/.agent/skills/{astro,wrangler,vidstack,deploy}/SKILL.md`
- `/home/az/git/moirai/.agent/skills/js-ts/{build,deps,lint,test}.md`
- `/home/az/git/moirai/.agent/skills/common/{git,review,security}.md`
- `/home/az/git/moirai/.agent/plans/roadmap.md`
- `/home/az/git/moirai/.agent/settings.local.json`
