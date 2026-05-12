# Sprint 0 Stage 9 — Real collections (programmes / bundles / instructors)

## Context

Stage 4 закрыт: компоненты `TierCard` и `InstructorCard` готовы,
но рендерятся в `index.astro` как placeholder секции с текстом
"Cards will appear in Stage 9". Причина — нет реальных данных:

- `src/content/programmes/` — пусто
- `src/content/bundles/` — пусто
- `src/content/instructors/` — пусто

Stage 9 заполняет эти три коллекции реальным контентом и подключает
`TierCard` / `InstructorCard` на главной (секции pricing +
instructors). После Stage 9 главная визуально соответствует
референсу `docs/moirai-home.html` **полностью**, без placeholder-блоков.

## Prerequisites (от пользователя)

Контент:
- **Цены тиров** для programmes (Beginner / Intermediate) и bundle
  (full-program) в EUR/USD центах
- **Список фич** на каждый тир (для tier features object и сравнения)
- **Bio + role** для двух преподавателей: Владимир Попов, Анастасия
  Засыпкина
- **Фото инструкторов** (R2 keys пока placeholder, реальные файлы —
  отдельный stage когда подключим R2 + image pipeline)
- **Социальные ссылки** инструкторов (опционально)

## Принципы

1. **Цены живут в `tiers[].base_price_amount` + `base_price_currency`**
   — никогда свободным текстом. pre-commit hook anti-hardcode (см.
   `.agent/rules/forbidden.md`) это enforced'ит.
2. **Translation pair.** Каждый programme/bundle/instructor имеет
   `.en.mdx` + `.ru.mdx` версии (или `monolingual: true`).
3. **Schema согласуется с zod в `src/content/config.ts`** (уже
   готова: `programmes`, `bundles`, `instructors`).
4. **Source of truth.** На сайте — `tiers[i].base_price_amount` (в
   центах). Никогда строка типа "€995" в `body` или `summary`. Для
   отображения форматируется через `Intl.NumberFormat` per-locale.

## Этапы

### 9a — instructors

Создать 4 файла (2 instructors × 2 locales):

- `src/content/instructors/vladimir-popov.en.mdx`
- `src/content/instructors/vladimir-popov.ru.mdx`
- `src/content/instructors/anastasia-zasypkina.en.mdx`
- `src/content/instructors/anastasia-zasypkina.ru.mdx`

Frontmatter shape (см. `src/content/config.ts` `instructors`):

```yaml
---
name: "Vladimir Popov"
role: "Film Director and Educator"
photo_r2_key: "media/instructors/vladimir-popov/photo.jpg"  # placeholder URL
bio_short: "Short bio — 1-2 sentences for cards on home page and program pages."
social:
  instagram: "https://instagram.com/..."
  imdb: "https://imdb.com/name/..."
seo:
  title: "Vladimir Popov — Film Director & Instructor at Moirai"
  description: "Working film director teaching directing, editing, and screenwriting at Moirai. Personal feedback on every assignment."
---

Long-form bio in MDX body — for /en/instructors/vladimir-popov page
(будет в Stage 10+). Содержит фильмографию, опыт, подход к
преподаванию. Сейчас на главной используется только bio_short из
frontmatter.
```

Аналогично для Анастасии. Контент пишет content-агент (см.
`.agent/agents/content.md`); агент берёт draft → редактирует →
финальная версия.

### 9b — programmes

Создать 4 файла (2 programmes × 2 locales):

- `src/content/programmes/beginner.{en,ru}.mdx`
- `src/content/programmes/intermediate.{en,ru}.mdx`

Frontmatter (см. `programmes` zod schema):

```yaml
---
title: "Beginner"
summary: "First-level filmmaking program: visual language, editing rhythm, three-act structure. End with your first short film."
duration_weeks: 12  # опц., для отображения
tiers:
  - id: "self-paced"
    name: "Self-Paced"
    base_price_amount: 49500  # центы = €495 / $495
    base_price_currency: "EUR"
    features:
      lectures_count: 12
      assignments_count: 12
      live_qa: false
      personal_review: false
      certificate: true
      community_access: true
  - id: "live"
    name: "Live Cohort"
    base_price_amount: 99500  # €995
    base_price_currency: "EUR"
    features:
      lectures_count: 12
      assignments_count: 12
      live_qa: true
      personal_review: true
      certificate: true
      community_access: true
      cohort_size_max: 15
  - id: "premium"
    name: "Premium"
    base_price_amount: 199500  # €1995
    base_price_currency: "EUR"
    features:
      lectures_count: 12
      assignments_count: 12
      live_qa: true
      personal_review: true
      one_on_one_sessions: 4
      final_film_review: true
      certificate: true
      community_access: true
seo:
  title: "Beginner Filmmaking Program — Direct Your First Short | Moirai"
  description: "12-week online filmmaking program. Visual language, editing, screenwriting. Three tiers from self-paced to live cohort with personal review."
---

# Beginner

Long-form MDX body — full curriculum, weekly schedule, FAQ specific to
this level. Renders at /en/beginner.
```

**Цены — финальные числа от пользователя.** Сейчас в плане
placeholder'ы (€495 / €995 / €1995); реальные значения подставит
content-агент по brief от ownership.

### 9c — bundles

Создать `src/content/bundles/full-program.{en,ru}.mdx`:

```yaml
---
title: "Full Program (Beginner + Intermediate)"
summary: "Complete two-level program — from cinema basics to festival-ready short. Save vs. buying separately."
includes_programmes: ["beginner", "intermediate"]
tiers:
  - id: "live"
    name: "Live Cohort"
    base_price_amount: 169500  # €1695, вместо €995 + €995 = €1990
    base_price_currency: "EUR"
    savings_vs_separate: 29500   # €295
    features:
      live_qa: true
      personal_review: true
      community_access: true
      both_levels: true
  - id: "premium"
    name: "Premium"
    base_price_amount: 349500  # €3495
    base_price_currency: "EUR"
    savings_vs_separate: 49500
    features:
      live_qa: true
      personal_review: true
      one_on_one_sessions: 8
      final_film_review: true
      both_levels: true
seo:
  title: "Full Program — Beginner + Intermediate Bundle | Moirai"
  description: "Both levels in one bundle. From first short to festival-ready film. Save €295-€495 vs. buying separately."
---

# Full Program

Long-form MDX body — описание ценности bundle vs. отдельной покупки.
```

### 9d — подключение в `index.astro` (instructors section)

```astro
import { getCollection, getEntry } from "astro:content";
import InstructorCard from "../../components/public/InstructorCard.astro";

// Top of frontmatter:
const instructorEntries = await Promise.all(
  sections.instructors.ids.map(id =>
    getEntry("instructors", `${id}.${typedLocale}`)
  )
);

// In template (replace placeholder):
<section class="section section--alt center" ...>
  <header class="section__head">...</header>
  <div class="instructor-grid">
    {instructorEntries.filter(Boolean).map(entry => (
      <InstructorCard
        name={entry.data.name}
        role={entry.data.role}
        body={entry.data.bio_short ?? ""}
      />
    ))}
  </div>
</section>
```

### 9e — подключение в `index.astro` (pricing section)

```astro
import TierCard from "../../components/public/TierCard.astro";
import { formatPrice } from "../../lib/format-price";

const beginner = await getEntry("programmes", `beginner.${typedLocale}`);
const intermediate = await getEntry("programmes", `intermediate.${typedLocale}`);
const fullBundle = await getEntry("bundles", `full-program.${typedLocale}`);

// Strategy: показать "Live Cohort" tier из beginner, из intermediate,
// и featured bundle. Featured — bundle (с пометкой "Save €X").
// Точная композиция — обсудить отдельно; для placeholder начнём с
// трёх tier-cards в порядке Beginner Live / Intermediate Live / Full
// Program Live (featured).
```

`src/lib/format-price.ts` — небольшой helper:

```ts
export function formatPrice(amount: number, currency: string, locale: "en" | "ru"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount / 100);
}
```

### 9f — подключение Schema.org (Stage 6 carry-over)

После Stage 6 у нас есть `CourseSchema` + `PersonSchema` компоненты,
ждущие данных. В `index.astro` (или per-programme/instructor pages
которые появятся в отдельном stage позже):

```astro
<Fragment slot="schema">
  <OrganizationSchema locale={typedLocale} />
  <FaqSchema items={faqs} />
  <CourseSchema programme={beginner} locale={typedLocale} />
  <CourseSchema programme={intermediate} locale={typedLocale} />
  {instructorEntries.filter(Boolean).map(entry =>
    <PersonSchema instructor={entry} locale={typedLocale} />
  )}
</Fragment>
```

### 9g — удалить placeholder'ы из `index.astro`

После 9d-9e в `index.astro` убрать:

- `<p class="text-faint">{ui.pendingStage9}</p>` блоки из секций
  instructors и pricing
- `ui.pendingStage9` из `dict.{en,ru}.ts` (если Stage 7 уже сделан —
  иначе из локального `ui` объекта)
- Комментарии `{/* Pricing — TierCard'ы рендерятся... */}` и
  `{/* Instructors — карточки рендерятся... */}` — убрать (placeholder
  больше не актуален)

## Verification

После всех этапов:
- [ ] `corepack pnpm tsx scripts/check-translation-pairs.ts` зелёный
      (если Stage 7 уже выполнен; иначе ручная проверка пар)
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные
- [ ] Локальный smoke: на `/en/` и `/ru/` секции pricing и instructors
      отдают карточки (не placeholder)
- [ ] Цены отображаются через `Intl.NumberFormat` per-locale
      (`€1,695` / `1 695 €` в зависимости от локали)
- [ ] Pre-commit hook anti-hardcode не падает на новых файлах
      (никаких чисел `\d{2,5}` свободным текстом)
- [ ] Deploy → production главная отдаёт реальные tier-card и
      instructor-card
- [ ] Schema.org Validator на проде: Course + Person schemas
      валидны, eligible for rich results

## Out of scope

- **Per-programme pages** (`/en/beginner`, `/en/intermediate`, `/en/full-program`)
  — отдельный stage. Stage 9 только наполняет коллекции и подключает
  главную.
- **Per-instructor pages** (`/en/instructors/vladimir-popov`) — отдельный
  stage с маршрутом `src/pages/[locale]/instructors/[id].astro`.
- **Checkout / Stripe** — отдельный архитектурный stage с биндингами
  D1 + secrets.
- **Реальные фотки инструкторов** в R2 — отдельная задача с R2 bucket
  setup + image pipeline.
- **Сравнительная таблица фич** между тирами — отдельный компонент,
  ждёт design.

## Critical files

- `src/content/instructors/{vladimir-popov,anastasia-zasypkina}.{en,ru}.mdx` (новые)
- `src/content/programmes/{beginner,intermediate}.{en,ru}.mdx` (новые)
- `src/content/bundles/full-program.{en,ru}.mdx` (новый)
- `src/lib/format-price.ts` (новый)
- `src/pages/[locale]/index.astro` (подключение коллекций, удаление placeholder)
- `src/components/schema/{Course,Person}Schema.astro` (активация после Stage 6)

## Reference

- `src/content/config.ts` — zod schemas
- `docs/Architecture.md` §4-5 (коллекции + tiers/features)
- `.agent/agents/content.md` (content-агент роль)
- `.agent/rules/forbidden.md` § Anti-hardcode
