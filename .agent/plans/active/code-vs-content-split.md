# Split: code deploys vs content deploys via GH Actions

> Created 2026-07-03. Цель: разделить два потока изменений и их
> deploy-циклы. Один репо, GH Actions с path-based фильтрами.
>
> Работаем на уровне папок. Сначала — инвентаризация и группировка.
> Дальше — дизайн workflow.

## Инвентаризация + группы (зафиксировано 2026-07-03)

### Группа A — Astro Content Collections (сборка в Worker bundle → Astro rebuild + Pages deploy)

- `src/content/announcements/`
- `src/content/bundles/`
- `src/content/instructors/`
- `src/content/journal/`
- `src/content/legal/`
- `src/content/pages/`
- `src/content/programmes/`
- `src/content/segments/`
- `src/content/works/`

### Группа B — R2 storage (upload через отдельный скрипт → без Astro build)

- `scripts/seed/module-content/` — staging для R2 `moirai-content` +
  D1 metadata. Uploader: `scripts/upload-module-content.mjs`.
  Владелец: методисты (Vladimir, Anastasia).

### Группа C — Статические ассеты (в Worker bundle → Astro rebuild)

- `public/images/`
- `public/fonts/`
- `src/assets/home/`

### Группа D — Не для prod (не деплоятся вообще)

- `docs/` — 20 файлов (спецификации, гайды, мокапы, runbooks)
- `.agent/` — meta для AI (`agents/`, `plans/`, `rules/`, `skills/`)
- `backups/` — SQL дампы

### Группа E — УДАЛЕНО 2026-07-03 (commit 4c65b0c)

- ~~`scripts/seed/student-book-drafts/`~~ — 48 legacy файлов
- ~~`scripts/upload-student-books.mjs`~~
- ~~`scripts/generate-student-book-drafts.mjs`~~
- ~~`drafts/`~~ — пустая папка, только .gitkeep
- ~~npm-scripts `drafts:gen`, `drafts:gen:force`, `drafts:upload`~~
- Legacy Stage 22 секция в `docs/methodist-modules-guide.md`

## Роли редакторов (временно для обсуждения, 2026-07-03)

Классификация по факту git log + предположениям о будущей команде.
Не окончательная — используется как рабочая гипотеза для дизайна
workflow.

### Роль 1 — Methodists (Vladimir, Anastasia)

**Зона:** `scripts/seed/module-content/` (Group B)

**Cadence:** активно при подготовке новых модулей + правки существующих

**Инструмент:** локальный редактор + `git push` + `pnpm exec node
scripts/upload-module-content.mjs` (или через GH Actions, TBD)

### Роль 2 — SMM / Editorial

**Зона (после уточнения 2026-07-03):**

- `src/content/journal/` — блог-посты (остаётся в MDX,
  длинные тексты, PR-review имеет смысл)

**Cadence:** weekly (планируется)

**Инструмент:** GH.com web-UI edit + PR + merge → auto-deploy
(без local Node/pnpm)

### Роль 4 — Admin / Content ops (через Admin CRUD UI)

**Зона (мигрируется в D1 + admin UI, отдельные планы):**

- **works** — YT-плеер + короткая подпись (title/director/year/YT-id).
  Мигрируется в D1 table `works` + admin CRUD `/admin/works`.
- **announcements** — промо-плашки (kind/text/cta/starts_at/ends_at/
  priority/dismissible). Мигрируется в D1 table `announcements` +
  admin CRUD `/admin/announcements` (уже в Sprint 2 ROADMAP).

**Cadence:** works — per-cohort (~6-9 недель); announcements —
per-campaign (несколько раз/мес)

**Инструмент:** admin UI (edit-in-place + soft on/off через
`published` flag + TTL через даты). Без git, без deploy.

**Обоснование:**
- Оба типа — структурированные данные, не prose. Формат ≈ форма
  из полей.
- Требуют активного управления (kill-switch, edit-in-place, reorder
  priorities), которое TTL один не решает.
- SMM-специалисту admin UI дружелюбнее, чем GH.com edit MDX.

### Роль 3 — Developer / Owner

**Зона:** всё остальное

- `src/**` (кроме `src/content/journal`)
- `src/content/programmes/`, `pages/`, `legal/`, `instructors/`,
  `bundles/`, `segments/`
- `public/`, `migrations/`, `db/`, `scripts/**` (кроме
  `seed/module-content/`)
- Root config: `astro.config.mjs`, `wrangler.toml`,
  `package.json`, `tsconfig.json`
- `docs/`, `.agent/`, `backups/` — не деплоится

**Cadence:** нерегулярный (фичи, багфиксы, стратегические правки)

**Инструмент:** local dev + PR + merge → auto-deploy

## Финальная архитектура (утверждено 2026-07-03)

### Репозитории

| Репо | Кто пушит | Что содержит |
|---|---|---|
| **`moirai`** (main, текущий) | Dev / Owner / SMM | Код + `src/content/*` (кроме module-content) + config + migrations |
| **`moirai-content`** (новый) | Methodists (Vladimir, Anastasia) | Учебные материалы: `modules/{slug}/(workbook\|presentation).{en,ru}.md`, `images/`, `metadata.yaml`, `docs/` (копия гайда) |

### D1 базы (раздельные)

| DB | Владелец | Содержит |
|---|---|---|
| **`moirai-prod`** | Main Worker | users, cohorts, sessions, applications, homework_submissions, enrollments, **modules (replica, sync target)** |
| **`moirai-content`** (новая) | Methodist Actions | **modules (source of truth)** — единственная таблица |

### Main Worker bindings (`wrangler.toml`)

```toml
[[d1_databases]]
binding = "DB"
database_name = "moirai-prod"

[[d1_databases]]
binding = "MODULES_DB"
database_name = "moirai-content"

[[r2_buckets]]
binding = "MODULE_CONTENT"
bucket_name = "moirai-content"  # без изменений — уже есть
```

### Sync mechanism: E2 (webhook) + E1 (cron fallback)

**Primary — E2 webhook:**
1. Content-репо GH Actions после d1 execute + r2 put → POST `/api/internal/sync-modules`
2. Auth: bearer `INTERNAL_SYNC_TOKEN` (в env main Worker + content-repo GH secrets)
3. Main Worker endpoint:
   - Читает `env.MODULES_DB.prepare('SELECT * FROM modules WHERE updated_at > ?')` (last_sync метка в KV_CACHE)
   - `UPSERT INTO env.DB.modules` (whitelist полей: title, lessons, has_homework, has_video, workbook_r2_key, presentation_r2_key, updated_at)
   - Обновляет `last_sync` в KV
4. Delay: мгновенно (несколько секунд)

**Fallback — E1 cron:**
- CF Cron trigger в main Worker: каждые 15 мин (либо 5 мин)
- Тот же pull-sync код, что и в E2 endpoint
- Догоняет если webhook fail'нул

**Rationale:** Content-репо compromise → в худшем случае искажение бодиков в R2 + записи в `moirai-content` D1. `moirai-prod` в целости — sync запись только внутри main Worker.

### Content-репо GH Actions token scope

`CF_API_TOKEN` в content-репо GH secrets:
- **R2 write only** к bucket `moirai-content`
- **D1 write only** к database `moirai-content` (whitelist SQL операций через простой скрипт)
- **НЕТ доступа** к `moirai-prod` (ни R2 других bucket'ов, ни D1)

Compromise-сценарий: методистский репо утёк →
- Могут испортить `moirai-content` D1 metadata → sync подхватит и main отобразит битую → быстрый revert в git + пересинк
- Могут перезаписать R2 объекты в `moirai-content` bucket → тоже revert из git
- **НЕ могут** трогать users, cohorts, applications, secrets, prod code

### GH Actions workflows

**В main-репо `moirai`:**
- `.github/workflows/pages-deploy.yml` — Astro build + CF Pages deploy на push в relevant paths (src, public, config)

**В content-репо `moirai-content`:**
- `.github/workflows/upload-modules.yml` — на push в `modules/**`:
  1. Detect changed files (diff HEAD~1..HEAD)
  2. R2 upload bodies + images
  3. D1 UPSERT metadata в `moirai-content` DB
  4. POST webhook `/api/internal/sync-modules` в main app (E2 primary)

### Migration steps

1. **Создать репо `lottoprof/moirai-content`** — public либо private (уточнить)
2. **Копировать без git-истории** `scripts/seed/module-content/` → `moirai-content/modules/` (18 модулей)
3. **Копировать `docs/methodist-modules-guide.md`** → `moirai-content/docs/methodist-guide.md`, обновить под новый flow
4. **Создать `metadata.yaml`** per module (миграция из `scripts/seed/modules-2026-05-19.json`)
5. **Создать D1 `moirai-content`** через `wrangler d1 create moirai-content`
6. **Migration 002X в main-репо:** ничего — таблица `modules` уже есть, просто станет sync target
7. **Migration в новой DB `moirai-content`:** копия schema `modules` из main → seed из yaml метаданных
8. **Настроить binding `MODULES_DB`** в main `wrangler.toml`
9. **Endpoint `/api/internal/sync-modules`** — реализация в main Worker
10. **CF Cron trigger** для fallback sync
11. **Setup GH secrets** в content-репо: `CF_API_TOKEN` (scoped), `CF_ACCOUNT_ID`, `INTERNAL_SYNC_TOKEN`, `SYNC_WEBHOOK_URL`
12. **Setup GH secrets** в main-репо: `CF_API_TOKEN` (Pages deploy scope), `CF_ACCOUNT_ID`
13. **Setup env `INTERNAL_SYNC_TOKEN`** в main Worker (wrangler pages secret put)
14. **Удалить из main-репо:**
    - `scripts/seed/module-content/` (все 18 модулей)
    - `scripts/upload-module-content.mjs`
15. **Первый deploy + test:**
    - Methodist делает test-push в content-репо (typo fix)
    - Убеждаемся: R2 uploaded, MODULES_DB updated, webhook triggered, main DB replica updated, страница модуля показывает новый текст

### Что дальше

Пункт по пункту реализовывать migration steps (1-15). Начнём с 1-3 (создание content-репо + миграция файлов).

TODO:
- Разобрать деплой-триггеры по группам (что запускает Pages
  rebuild, что нет)
- Дизайн workflow-файлов `.github/workflows/*.yml`
- Секреты (CF_API_TOKEN, CF_ACCOUNT_ID) в GH repo secrets
- Rollback стратегия

## НЕ забыть

Незакоммиченный до этого rebrand `Moirai → MoiraiOnline`
(commit 12c5bee) вошёл в push от 4c65b0c. **Не задеплоен** — ждёт
следующей правки перед деплоем (по указанию пользователя).
