# Sprint 0 Stage 16 — Collection index pages (works / journal)

> **STATUS 2026-05-21:** Не начат, deferred.
> Блокирует контент: коллекции `works/` и `journal/` пустые. Студенческие
> фильмы появятся после 1й завершившейся cohort'ы; журнал — после
> запуска content-pipeline.
> Footer-ссылки `/works` и `/journal` сейчас 404. Опция: удалить из
> Footer до реализации (избежать live-404). Приоритет: низкий до
> появления контента.

## Context

Footer ссылается на `/{locale}/works` и `/{locale}/journal` —
обе сейчас 404. Это listing-страницы для двух коллекций, которые
в Stage 0 пустые:

- `src/content/works/` — фильмография студентов (видеоплеер, runtime,
  credits)
- `src/content/journal/` — блог-посты (агентский pipeline через
  `drafts/journal/` → редактура → final)

Stage 16 создаёт:
1. Listing-страницы (`/works`, `/journal`) с placeholder если коллекция
   пустая
2. Item detail pages (`/works/[slug]`, `/journal/[slug]`)

Реальный контент в коллекциях — пост-Sprint 0 (работы студентов
появятся после первой когорты; журнал начнёт пополняться через
content-агент).

## Этапы

### 16a — journal listing page

`src/pages/[locale]/journal/index.astro`:

```astro
---
import { getCollection } from "astro:content";
import Layout from "../../../layouts/public/Layout.astro";
export const prerender = true;
export function getStaticPaths() {
  return [{ params: { locale: "en" } }, { params: { locale: "ru" } }];
}
const { locale } = Astro.params;
const posts = (await getCollection("journal"))
  .filter(e => e.id.endsWith(`.${locale}`))
  .sort((a, b) => +b.data.date - +a.data.date);
---
<Layout locale={locale} seo={{...}}>
  <section class="section center">
    <header class="section__head">
      <p class="eyebrow">{t.journal.eyebrow}</p>
      <h1 class="h1">{t.journal.title}</h1>
      <p class="text-muted">{t.journal.lede}</p>
    </header>

    {posts.length === 0 ? (
      <p class="text-faint">{t.journal.empty}</p>
    ) : (
      <ul class="journal-list">
        {posts.map(p => (
          <li>
            <article class="journal-card">
              <time class="text-faint">{formatDate(p.data.date, locale)}</time>
              <h2><a href={`/${locale}/journal/${p.data.slug}`}>{p.data.title}</a></h2>
              <p>{p.data.excerpt}</p>
              <ul class="cluster">
                {p.data.tags.map(tag => <li class="tag">#{tag}</li>)}
              </ul>
            </article>
          </li>
        ))}
      </ul>
    )}
  </section>
</Layout>
```

### 16b — journal post page

`src/pages/[locale]/journal/[slug].astro` — динамический route на
коллекцию journal.

Light theme регион для long-form (Stage 10 dependency):

```astro
<Layout ...>
  <header class="journal-hero">  {/* dark cover */}
    <div class="center">
      <p class="eyebrow">{entry.data.author} · {formatDate(entry.data.date, locale)}</p>
      <h1 class="h1">{entry.data.title}</h1>
      {entry.data.excerpt && <p class="text-muted">{entry.data.excerpt}</p>}
    </div>
  </header>

  <article class="section center" data-theme="light">
    <div class="prose">
      <Content />
    </div>
  </article>

  {/* Schema.org Article — добавим если будут заметки */}
</Layout>
```

### 16c — works listing page

`src/pages/[locale]/works/index.astro` — то же что journal index,
но рендерим карточки работ.

Карточка работы: thumbnail (R2 image — placeholder если нет
`thumbnail_r2_key`), title, director (имя студента), year,
короткий tagline.

```astro
const works = (await getCollection("works"))
  .filter(e => e.id.endsWith(`.${locale}`))
  .sort((a, b) => b.data.year - a.data.year);

// ...
{works.length === 0 ? (
  <p class="text-faint">{t.works.empty}</p>
) : (
  <div class="works-grid">
    {works.map(w => (
      <a href={`/${locale}/works/${w.data.slug}`} class="work-card">
        <div class="work-card__thumb">
          {w.data.thumbnail_r2_key ? (
            <img src={`https://media.moiraionline.pro/${w.data.thumbnail_r2_key}`} alt="" />
          ) : (
            <div class="work-card__thumb-placeholder" />
          )}
        </div>
        <p class="work-card__year">{w.data.year}</p>
        <h2 class="work-card__title">{w.data.title}</h2>
        <p class="work-card__director">{w.data.director}</p>
      </a>
    ))}
  </div>
)}
```

### 16d — work detail page

`src/pages/[locale]/works/[slug].astro`:

- Hero с title + director + year
- Видеоплеер (Vidstack — но это Sprint 1+ когда видео в R2). Пока
  thumbnail + "Video coming soon"
- Filmmakers list (`role: name`)
- Programme link (если `programme_id` указан)
- Schema.org VideoObject — Stage 6+ когда R2 stream pipeline

### 16e — empty-state UX

Поскольку коллекции пустые, важно чтобы empty-state выглядел
осмысленно, а не как "broken page":

- **Journal empty:** "Posts coming soon. Subscribe to be notified" с
  email-подпиской (waitlist через `/api/applications type=newsletter`?
  — отдельное решение).
- **Works empty:** "Student films will appear here after the first
  cohort finishes. Spring 2026." с CTA Apply.

### 16f — verification

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
```

- `/en/journal`, `/ru/journal` — 200, empty-state с CTA
- `/en/works`, `/ru/works` — 200, empty-state с CTA
- После добавления первого post в `src/content/journal/` —
  re-build → пост появляется в листе
- `/en/journal/[slug]` и `/en/works/[slug]` — 200, light theme на
  body

## Verification

- [ ] 4 index routes отдают 200 (works/journal × 2 locales)
- [ ] Empty-state выглядит осмысленно
- [ ] Когда добавим entry в коллекцию — она появляется в листе и
      имеет рабочий detail-page
- [ ] sitemap содержит 4 index routes + per-entry routes когда
      коллекции заполнены
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные

## Out of scope

- **Реальные journal posts** — content-агент через `drafts/journal/`
  pipeline, отдельная редактура задача.
- **Реальные works** — после первой когорты выпускает свои
  короткометражки, добавляются через content-агент.
- **Vidstack player** для works — Sprint 1+ когда видео в R2 +
  CDN endpoint.
- **Pagination** — пока количества контента мало, скроллим всё.
  Добавим если > 30 entries.
- **Tag filter / search** — отдельная фича когда количество
  постов оправдает.
- **RSS feed** для journal — отдельный stage когда журнал начнёт
  пополняться.
- **OG-image dynamic generation** для per-entry pages — отдельно
  (через CF Workers + satori).

## Critical files

- `src/pages/[locale]/journal/index.astro` (новый)
- `src/pages/[locale]/journal/[slug].astro` (новый)
- `src/pages/[locale]/works/index.astro` (новый)
- `src/pages/[locale]/works/[slug].astro` (новый)
- `src/lib/format-date.ts` (новый — `Intl.DateTimeFormat` helper
  per-locale)
- `src/styles/utilities.css` (журналь / works грид + card стили)
- `src/components/public/JournalCard.astro` (опц.)
- `src/components/public/WorkCard.astro` (опц.)

## Dependencies

- **Stage 10** — light theme infra (для post body и work bio)
- **Stage 7** (рекомендуется) — UI-строки в dict
- Реальный контент НЕ блокирует — empty-state живёт сразу

## Reference

- `src/content/config.ts` — journal/works zod schemas
- `docs/Architecture.md` §4 — journal agent pipeline
- `.agent/agents/content.md` — content-агент для drafts→final
