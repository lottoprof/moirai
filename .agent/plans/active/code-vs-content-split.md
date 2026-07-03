# Split: code deploys vs content deploys

> Created 2026-07-03. Цель: разделить два потока изменений и их
> deploy-циклы. Сейчас всё живёт в одном репо → любая правка
> контента триггерит full Worker rebuild + deploy.

## Мотивация

Свежий пример (rebrand `Moirai → MoiraiOnline`):
- Один семантический сдвиг → 25 файлов в диффе
- Из них 17 файлов — контент (`src/content/works/`, `programmes/`,
  `pages/home.{en,ru}.mdx`)
- 8 файлов — код (Layout, Nav, Footer, site-config, SeoHead,
  Schema, Logo)
- `pnpm release` пересобирает всё атомарно, деплой ~1 минута
  Worker bundle 2.7 MB

Пейн-поинты:
1. **Правка опечатки в journal-посте** = full code rebuild.
2. **Методист не может править content** без code-toolchain (Node
   22, pnpm, wrangler login).
3. **Race conditions**: если разработчик правит код и методист
   параллельно правит контент → merge conflicts + один
   релиз-цикл на двоих.
4. **Blast radius**: content typo может уронить build (broken
   frontmatter) → блокирует code deploy тоже.
5. **Cache invalidation**: любой deploy инвалидирует ВЕСЬ
   edge cache CF Pages, даже если менялся только 1 текст.

## Инвентаризация: что такое «content»

### A. Content collections (Astro MDX) — сейчас в `src/content/`

| Coll | Files | Кто редактирует | Частота |
|---|---|---|---|
| `programmes/` (beginner/intermediate/individual/bundle × en+ru) | 8 | Основатель + методист | Средне (2-4 раза/мес при иценах, кранч перед запусками) |
| `works/` (portfolio student films) | 12 (6 × 2 locales) | Методист / автор контента | Часто (новые работы студентов каждую когорту) |
| `journal/` (blog posts) | 2+ | Author / editor | Часто (еженедельно при активном ведении) |
| `pages/home.{en,ru}.mdx` | 2 | Основатель | Редко (SEO refine) |
| `legal/{privacy,terms,refund,cookies}.{en,ru}.mdx` | 8 | Legal / основатель | Очень редко (при изменении tos) |
| `instructors/{vladimir,anastasia}.{en,ru}.mdx` | 4 | Основатель / instructors | Редко |
| `announcements/*.mdx` | dynamic | Основатель / marketing | Средне (промо-акции) |
| `voice-guide.md` | 1 | Основатель | Очень редко |

### B. Content уже вне репо

- **Modules** — workbook.md / presentation.md **в R2** (`moirai-content`
  bucket), key `modules/<slug>/<file>.<locale>.md`. Grabbed by Worker
  binding at runtime. Уже отдельный поток (methodist uploads через
  `scripts/upload-module-content.mjs`).
- **Homework submissions** — R2 `moirai-homework`, D1 metadata.
- **User profiles** — D1.
- **Cohorts / sessions** — D1, admin CRUD UI.

### C. Что точно должно остаться в code-repo

- Astro components (`.astro`)
- TypeScript logic (`.ts`)
- Middleware, API endpoints
- D1 schema/migrations
- Wrangler config
- Style tokens (`.css`)
- Package deps

## Опции

### Option 1 — External `moirai-content` repo + GH Actions

**Structure:**
```
github.com/{org}/moirai-content/
  ├── programmes/*.mdx
  ├── works/*.mdx
  ├── journal/*.mdx
  ├── announcements/*.mdx
  └── pages/*.mdx
```

**Flow:**
- Content editor pushes к `moirai-content` (можно через GH web UI —
  не нужен local toolchain)
- GH Actions webhook в code-repo → `git submodule update` OR sync
  скрипт → CF Pages rebuild+deploy

**Pros:**
- Clear ownership boundary (content team vs code team)
- Content editor не нужен Node/pnpm — правит через GH.com UI
- Можно применить branch protection / review отдельно на content

**Cons:**
- Пока всё равно full Astro rebuild (не incremental)
- Deploy time не меняется (~1 min)
- Требуется настройка sync (submodule, git subtree, или CI-скрипт)
- Единый релиз-цикл сохраняется (просто триггер снаружи)

**Effort:** ~2 дня.

### Option 2 — D1-backed content + admin CRUD

**Structure:**
- Новые D1 таблицы: `content_works`, `content_journal`,
  `content_pages`, `content_announcements`
- Астро pages fetch'ат D1 в SSR (уже делаем для cohorts/apply)
- Admin UI в `/admin/content/*` — rich text editor или markdown editor

**Flow:**
- Author пишет в admin UI → D1 UPDATE
- SSR отдаёт свежий контент на следующем запросе
- **НЕТ deploy'а вовсе** для контента

**Pros:**
- Zero-deploy content update — методист меняет тексты live
- Rollback через D1 audit_logs (у нас уже есть pattern)
- Preview через draft/published flag
- Можно дать доступ методисту без git-навыков

**Cons:**
- Большой рефакторинг: content collection API → D1 queries
- Теряем type-safe frontmatter из zod-схем (нужно валидировать D1 rows)
- Rich content (markdown с YT-embed, images) требует storage +
  serving логики
- Admin UI: rich editor не тривиально (markdown IDE vs WYSIWYG)
- Search/indexing: Astro's static content collections отпадут

**Effort:** 3-5 недель на полную миграцию всех коллекций.

### Option 3 — Hybrid (рекомендую)

**Категория по частоте изменений:**

| Коллекция | Куда | Причина |
|---|---|---|
| `programmes/` | **code-repo** (остаётся) | Semver-controlled: цена, содержание — реально код |
| `legal/` | **code-repo** (остаётся) | Legal review обязателен через PR |
| `voice-guide.md` | **code-repo** | Референс для команды |
| `instructors/` | **code-repo** | Меняется 1-2 раза в год |
| `pages/home.mdx` | **code-repo** (пока) | SEO-critical, редко |
| `works/` | **D1 + admin CRUD** | Новые каждую когорту, методист правит |
| `journal/` | **D1 + admin CRUD** | Weekly posting, author правит live |
| `announcements/` | **D1 + admin CRUD** (уже в roadmap) | Промо меняется часто |
| Modules (workbook/present) | **R2** (уже) | Готово |

**Гибрид:**
- Code+static content → code-repo → `pnpm release`
- Editorial content (works, journal, announcements) → D1 → zero-deploy
- Modules → R2 (существующий поток)

**Effort:** 2 недели на works+journal+announcements миграцию в D1.

### Option 4 — Content на CMS (Sanity, Contentful, Strapi)

**Structure:**
- Content живёт в external CMS
- Астро fetch'ит на build time OR runtime

**Pros:**
- Готовый WYSIWYG editor
- Team collaboration
- Draft/publish/schedule out of the box

**Cons:**
- $$$ (Sanity Free tier ok, но limits)
- Vendor lock-in
- External API dependency (single point of failure)
- Нарушает CF Free Tier принцип «self-hosted всё что можно»

**Effort:** 1-2 недели интеграция + $XX/мес.

## Рекомендация: Option 3 (Hybrid) + Option 1 фаллбэк

**Rationale:**
- Editorial (works, journal, announcements) выигрывает больше всего
  от zero-deploy — там кранч и разные редакторы
- Legal, programmes, pages — «code by nature», выиграшей мало
- Modules R2 уже работает, паттерн проверен

**Bonus:** `announcements` в D1 уже был в Sprint 2 ROADMAP —
логично объединить с works/journal в одном migration-cycle.

## Sequencing (если ok Option 3)

**Stage 1 — announcements → D1** (уже в roadmap, минимальный риск)
- Migration 002X: table `announcements` (kind, text, cta_*, dates, priority, dismissible, locale)
- Admin CRUD `/admin/announcements`
- PromoStrip + AnnouncementBar read from D1
- Delete `src/content/announcements/`

**Stage 2 — works → D1** (medium risk)
- Migration: table `works` (slug, title, synopsis, hero_image, director, cohort, year, video_url, awards[])
- Admin CRUD `/admin/works`
- `/[locale]/works` list + `/[locale]/works/[slug]` detail read from D1
- Preserve current URLs

**Stage 3 — journal → D1** (medium risk)
- Migration: table `journal` (slug, title, body_md, author, published_at, tags[])
- Admin CRUD `/admin/journal`
- Rich-content markdown с YT-embed support (переиспользовать
  MarkdownContent.astro)
- Author-facing editor: monaco / codemirror с markdown highlighting

**Stage 4 — evaluate** what остальное stоит мигрировать
(вероятно pages/home для быстрых SEO exp'ов)

**Не трогаем:** programmes, legal, instructors, voice-guide.

## Открытые вопросы

1. **Rich editor UX** для journal — WYSIWYG (typa Notion) или
   markdown IDE? WYSIWYG сложнее сделать, markdown IDE легче но
   учить методиста.
2. **Draft/published workflow** — нужна ли preview на другом URL
   для black-box проверки перед публикацией?
3. **Migration data** — как перевезти существующие 12 works +
   journal posts из MDX в D1? Одноразовый скрипт.
4. **Images / media** — куда грузить фото для works/journal?
   Собственный R2 `moirai-media` bucket + admin uploader?
5. **Search** — если journal растёт, нужен full-text search
   (D1 FTS5)?
6. **Rollback** — как откатить кривой контент? Audit logs +
   revert button?

## Что дальше

Утверждение направления (Option 3 Hybrid?) → детальный plan на
Stage 1 (announcements). Каждый stage — свой plan-документ +
migration + deploy.

## НЕ забыть

- Незакоммиченный текущий rebrand deploy (`12c5bee`) — либо
  задеплоить как есть после re-login, либо продолжить в этом же
  плане (тогда логотип SVG redesign — Phase 2)
