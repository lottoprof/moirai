# Stage 22 — R2 + student_book черновики

## Контекст

Метаданные модулей уже в D1 (48 строк = 24 модуля × 2 locale, Stage 21
+ seed 2026-05-19). `modules.body_r2_key` выставлен на planned путь
`modules/{slug}.{locale}.md`, но самого R2 bucket'a ещё нет и тела
модулей не загружены.

Цель Stage 22 — поднять R2 и залить **первичные черновики**
student_book для всех 48 (slug, locale). Это _не_ финальный контент
методиста — это структурированные placeholder-md с уже известным
контекстом (title / summary / objectives / concepts / homework из D1),
чтобы:

1. Платформа умела фетчить body из R2 (разблокирует Sprint 1 dashboard).
2. У методиста был готовый каркас на 48 файлов вместо пустоты.
3. Path B (external repo `moirai-content` + GH Actions sync,
   decisions 2026-05-19) был на следующем шаге, не до этого.

Финальный body-формат (text + YouTube + изображения + Mermaid)
обсуждается отдельно — для черновиков достаточно markdown с разделами
"Reference / Video / Homework".

## Решения, на которые опирается

- `decisions.md` 2026-05-19 — структура `modules/{slug}/student_book.{locale}.pdf|md`
  во внешнем репо `moirai-content`. Для Stage 22 используем тот же
  путь в R2: `modules/{slug}.{locale}.md` (т.к. `body_r2_key` уже так
  записан в D1 при seed'е).
- `decisions.md` (rules/decisions.md строки 61–62) — публичные ассеты
  остаются в `src/assets/images/**`, R2 — только для приватных
  asset'ов (student_book подпадает: доступ только enrolled student'ам).

## Файлы для создания / изменения

**Создать:**
- `scripts/seed/student-book-drafts/{slug}.{ru,en}.md` × 48 файлов
  (генерируются скриптом, коммитятся в git как исходник)
- `scripts/generate-student-book-drafts.mjs` — читает
  `scripts/seed/modules-2026-05-19.json` + рендерит 48 markdown'ов
  по шаблону. Idempotent (overwrite только если файл не существует
  ИЛИ передан `--force`)
- `scripts/upload-student-books.mjs` — заливает 48 файлов в R2
  через `wrangler r2 object put moirai-content/modules/{slug}.{locale}.md
  --file=…`. Прогресс-лог + counter

**Модифицировать:**
- `wrangler.toml` — раскомментировать R2-блок, заменить заглушку
  `MEDIA`/`moirai-media` на `MODULE_CONTENT`/`moirai-content`
- `worker-configuration.d.ts` — сгенерится через `corepack pnpm exec wrangler types`
- `package.json` — npm scripts: `drafts:gen`, `drafts:upload`,
  `drafts:upload:dry`
- `scripts/seed-modules.mjs` — убрать генерацию stub'ов в `/tmp/`
  (вынесено в `generate-student-book-drafts.mjs`)
- `docs/methodist-modules-guide.md` — добавить секцию "Student_book
  body workflow" (черновик → правка в git → re-upload в R2)

**Не входит в Stage 22:**
- SSR-страница `/[locale]/dashboard/modules/[slug]` — Stage 23
- Image / video / Mermaid pipeline — отдельная итерация после
  фиксации body-формата
- GH Actions `moirai-content` sync (Path B) — Sprint 2
- ACL / signed URLs для R2 (приватный доступ только enrolled) — Stage 24
- Любое потребление R2 body из public site

## Чеклист (этапы с обязательным коммитом после каждого)

- [ ] **22a (user action)** — Включить R2 в CF dashboard
  (`https://dash.cloudflare.com/?account=f168a4…` → R2 → Enable).
  Признак готовности: `corepack pnpm exec wrangler r2 bucket list`
  завершается успешно (не "R2 not enabled").
- [ ] **22b** — `corepack pnpm exec wrangler r2 bucket create moirai-content`
  (region — авто по аккаунту, ENAM). Подтвердить
  `wrangler r2 bucket list`.
- [ ] **22c** — Update `wrangler.toml` (R2 binding `MODULE_CONTENT`)
  + `corepack pnpm exec wrangler types` + закоммитить
  `worker-configuration.d.ts`. Smoke: `pnpm typecheck` зелёный.
- [ ] **22d** — `scripts/generate-student-book-drafts.mjs` + сгенерить
  48 файлов в `scripts/seed/student-book-drafts/`. Шаблон ниже.
  Закоммитить и сами файлы (исходник истины для черновиков).
- [ ] **22e** — `scripts/upload-student-books.mjs`. Smoke сначала на
  одном файле (`--only=beg-cinema-language.en`), потом полный прогон.
- [ ] **22f** — Verify: `wrangler r2 object list moirai-content --prefix=modules/`
  → ровно 48 объектов. `wrangler r2 object get moirai-content/modules/beg-cinema-language.en.md`
  → корректный md.
- [ ] **22g** — Обновить `docs/methodist-modules-guide.md` — раздел
  "Student_book body workflow (Sprint 1)".
- [ ] **22h** — `pnpm lint && pnpm typecheck && pnpm build` — всё чисто.
- [ ] **22i** — Коммит + production deploy через `wrangler pages deploy`
  (binding теперь активен, runtime увидит R2). Smoke prod: открыть
  `/en/` — никаких регрессий.
- [ ] **22j** — `git mv .agent/plans/active/sprint1-stage22-r2-student-book-drafts.md
  .agent/plans/done/` отдельным коммитом.

## Шаблон черновика student_book

`scripts/seed/student-book-drafts/{slug}.{locale}.md`:

```markdown
---
slug: beg-cinema-language
locale: ru
title: "Язык кино"
status: draft
generated_at: 2026-05-20
---

> **Черновик.** Заполняется методистом. После правки — `pnpm drafts:upload`.

## Цели модуля
- {objectives[0]}
- {objectives[1]}
- …

## Понятия
{concepts.join(" · ")}

## Опорный материал
<!-- TODO: основной текст лекции. Можно вставлять YouTube ссылки,
изображения, Mermaid-диаграммы (формат фиксируется отдельно). -->

## Видео
<!-- TODO: ссылка на запись лекции / YouTube, если has_video=1
или has_external_video=1. -->

## Домашнее задание
{homework_md ?? "<!-- TODO: формулировка ДЗ -->"}
```

Аналогично для `en`. Все секции — placeholder, методист заполняет
поверх. Frontmatter `slug`/`locale`/`title` зафиксированы из D1 — не
редактировать вручную.

## Verification

После 22e/22f:

```bash
# 48 объектов в bucket'е
corepack pnpm exec wrangler r2 object list moirai-content --prefix=modules/ | wc -l

# Один объект целиком
corepack pnpm exec wrangler r2 object get moirai-content/modules/beg-cinema-language.ru.md
```

После 22i на prod:

```bash
# Smoke главной — никаких регрессий от добавления binding'a
curl -sI https://moiraionline.pro/en/ | head -3
```

## Done criteria

- R2 bucket `moirai-content` существует и привязан как `MODULE_CONTENT`
- 48 черновиков лежат в `scripts/seed/student-book-drafts/` в git
- 48 объектов залиты в R2 по путям, совпадающим с `modules.body_r2_key`
- Скрипты `drafts:gen` / `drafts:upload` идемпотентны и
  задокументированы в methodist guide
- План перемещён в `.agent/plans/done/`
