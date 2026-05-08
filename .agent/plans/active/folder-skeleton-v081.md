# Folder Skeleton — Sprint 0 Stage 1

## Context

Pre-Sprint 0: создать пустой скелет директорий проекта по
`docs/Architecture.md` §arch + `rules/architecture.md`. Никакого
кода, конфигов, deps — только дерево папок с `.gitkeep`-файлами.

Задача узкая: один коммит, без переименований и миграций. После
него будет отдельный этап с `package.json`, `astro.config.mjs`,
`tsconfig.json`, `wrangler.toml`.

## Принципы

1. **Только директории + `.gitkeep`.** Никаких `.md`, `.ts`, `.astro`
   файлов сверх плейсхолдера.
2. **Имена литеральные.** `[locale]` — это Astro 5 dynamic-segment,
   создаётся буквально `src/pages/[locale]/`.
3. **Один коммит** — `chore(structure): scaffold folder skeleton`.
4. **`.gitkeep` пустой** — байтов не будет.

## Дерево директорий (24 листа)

### `src/`
```
src/pages/[locale]/
src/pages/[locale]/dashboard/
src/pages/admin/
src/pages/api/
src/content/programmes/
src/content/bundles/
src/content/instructors/
src/content/segments/
src/content/pages/
src/content/journal/
src/content/works/
src/components/public/
src/components/dashboard/
src/components/admin/
src/layouts/public/
src/layouts/dashboard/
src/layouts/admin/
src/lib/server/
src/lib/shared/
src/styles/
```

### Top-level
```
db/
migrations/
public/
drafts/_briefs/
drafts/posts/
```

Внутри `src/content/` файл `voice-guide.md` и `src/content/config.ts`,
`src/middleware.ts`, `src/env.d.ts`, `db/types.ts` — это **файлы**, не
папки; на этом этапе **не создаём** (Sprint 0 stage 2+).

## Owner-маппинг (для проверки `boundaries.md`)

| Каталог                          | Owner            |
|----------------------------------|------------------|
| `src/pages/[locale]/`            | `astro-public`   |
| `src/pages/[locale]/dashboard/`  | `astro-dashboard`|
| `src/pages/admin/`               | `astro-admin`    |
| `src/pages/api/`                 | `pages-ssr`      |
| `src/content/**`                 | `content`        |
| `src/components/public/`         | `astro-public`   |
| `src/components/dashboard/`      | `astro-dashboard`|
| `src/components/admin/`          | `astro-admin`    |
| `src/layouts/{public,dashboard,admin}/` | соответ.  |
| `src/lib/server/`                | `pages-ssr`      |
| `src/lib/shared/`                | shared (любой)   |
| `src/styles/`                    | shared           |
| `db/`                            | `pages-ssr` (`db/types.ts`) |
| `migrations/`                    | `schema`         |
| `public/`                        | `astro-public` (статика) |
| `drafts/`                        | `content`        |

Все ownerы уже описаны в `.agent/agents/` после stage3+ — конфликтов
быть не должно.

## Verification

```bash
# дерево
find src db migrations public drafts -type d | sort

# .gitkeep везде
find src db migrations public drafts -type d -empty
# должен быть пустым (т.к. в каждой лежит .gitkeep)

# счётчик
find . -path './node_modules' -prune -o -name .gitkeep -print | wc -l
# = 25 (24 src/top-level + 0 родители; см. список выше)

# git tracked
git ls-files | grep -c '\.gitkeep$'
```

После Sprint 0 stage 2 (`package.json` и конфиги) — `.gitkeep` будут
постепенно удаляться по мере появления реальных файлов в каждой папке.

## Out of scope

- `package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.toml`
  — следующий этап.
- `pnpm install` — после конфигов.
- Файлы-плейсхолдеры (`middleware.ts`, `env.d.ts`, `content/config.ts`,
  `db/types.ts`, `voice-guide.md`).
- `src/pages/index.astro` (редирект `/` → `/{locale}/`) — после deps.

## Critical files to create

`.gitkeep` в каждой из 25 директорий (24 листа + 0 промежуточных,
`mkdir -p` создаст промежуточные автоматически без `.gitkeep`).
Промежуточные `src/pages/`, `src/content/`, `src/components/`,
`src/layouts/`, `src/lib/`, `drafts/` — без `.gitkeep`, т.к. имеют
непустых детей.
