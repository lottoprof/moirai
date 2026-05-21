# Sprint 0 Stage 6 — Schema.org JSON-LD components

## Context

После Stage 4-5 публичный слой визуально готов. Для SEO-карусели
курсов Google и Rich Results нужны структурированные данные. Сейчас
в `<head>` ничего нет кроме canonical/hreflang/OG (Stage 3 + 4).

Stage 6 добавляет четыре JSON-LD компонента. Все рендерят `<script
type="application/ld+json">` в `<head>` — никакого runtime JS,
нулевая стоимость для CWV.

## Принципы

1. **Один компонент = одна схема.** Композиция страницы определяет
   набор. Например, главная: `Organization` + `FAQPage`.
   Programme page: `Course` + ссылка на `Organization` через `@id`.
2. **Источник правды — Content Collections** (когда появятся в
   Stage 9). До этого — `FaqSchema` работает на `home.faqs[]`, а
   `OrganizationSchema` использует глобальный
   `src/lib/site-config.ts` (константы: name, url, logo, socials).
3. **Per-locale.** Каждая локаль → свой JSON-LD блок с `inLanguage`,
   локализованным name/description.
4. **`@id` для cross-referencing.** Стабильные URL-фрагменты:
   `https://moiraionline.pro/#organization`,
   `https://moiraionline.pro/en/beginner#course`,
   `https://moiraionline.pro/en/instructors/vladimir-popov#person`.

## Этапы

### 6a — `src/lib/site-config.ts` + типы

Новый файл с глобальными константами:

```ts
export const SITE = {
  url: "https://moiraionline.pro",
  name: "Moirai",
  legalName: "Moirai Online Filmmaking Program",
  logo: "https://moiraionline.pro/logo.svg", // placeholder, пока без файла
  social: [
    // "https://instagram.com/moirai...",
    // "https://youtube.com/@moirai...",
  ],
  email: "hello@moiraionline.pro", // placeholder
};
```

Чисто конфиг, нет рантайма. Используется и в SeoHead, и в schema-компонентах.

### 6b — OrganizationSchema (EducationalOrganization)

`src/components/schema/OrganizationSchema.astro`:

- `@type: "EducationalOrganization"` (более конкретный, чем
  generic Organization)
- `@id: "${SITE.url}/#organization"`
- `name`, `legalName`, `url`, `logo`, `sameAs[]` (соцсети)
- `description` — короткий per-locale текст (брать из
  `dict.{locale}.ts` после Stage 7, до этого — inline-объект как
  в `index.astro`)
- `inLanguage` — текущая локаль

Подключается в Layout для всех публичных страниц.

### 6c — CourseSchema

`src/components/schema/CourseSchema.astro`:

- `@type: "Course"`
- `@id: "${SITE.url}/${locale}/${programmeId}#course"`
- `name`, `description`, `inLanguage`, `educationalLevel`
- `provider`: `{ "@id": "${SITE.url}/#organization" }` — ссылка
- `hasCourseInstance[]` — каждый tier как `CourseInstance`:
  - `courseMode: "Online"`
  - `inLanguage`
  - `offers`: `{ @type: "Offer", price, priceCurrency, availability }`
- `instructor[]` — массив `{ "@id": "${SITE.url}/${locale}/instructors/${id}#person" }`

Пропы: programme entry из Content Collection `programmes` (появится в
Stage 9). До Stage 9 компонент готов, но в `index.astro` НЕ
подключается — секция pricing остаётся placeholder.

### 6d — PersonSchema

`src/components/schema/PersonSchema.astro`:

- `@type: "Person"`
- `@id: "${SITE.url}/${locale}/instructors/${id}#person"`
- `name`, `jobTitle` (instructor.role), `image` (R2 URL)
- `sameAs[]` — массив social URLs из `instructor.social`
- `worksFor`: `{ "@id": "${SITE.url}/#organization" }`
- Опционально `description` — `bio_short` из коллекции

До Stage 9 не подключается.

### 6e — FaqSchema

`src/components/schema/FaqSchema.astro`:

- `@type: "FAQPage"`
- `mainEntity[]` — массив `{ @type: "Question", name, acceptedAnswer:
  { @type: "Answer", text } }`
- **Самая независимая схема** — данные напрямую из `home.faqs[]`,
  никаких внешних коллекций. Подключается в `index.astro` сразу.

### 6f — интеграция в Layout и pages

`Layout.astro` принимает опциональный schema slot (или массив
schema-компонентов через props). Решение: использовать **named slot**
`<slot name="schema" />` в `<head>` — page передаёт нужные schemas:

```astro
<Layout locale={typedLocale} seo={seo}>
  <Fragment slot="schema">
    <OrganizationSchema locale={typedLocale} />
    <FaqSchema items={faqs} />
  </Fragment>
  <Hero ... />
  ...
</Layout>
```

В `Layout.astro`:

```astro
<head>
  ...
  <SeoHead .../>
  <slot name="schema" />
</head>
```

### 6g — валидация

```bash
pnpm build
pnpm exec wrangler pages deploy ./dist --branch preview/schema
```

Получить preview URL, открыть в:
- **Google Rich Results Test** (`search.google.com/test/rich-results`)
- **Schema.org Validator** (`validator.schema.org`)

Проверки:
- 0 errors, 0 warnings на FAQPage и EducationalOrganization
- "Eligible for rich results" badge
- После Stage 9 — Course/Person тоже валидируются на per-programme и
  per-instructor preview pages

## Verification

После всех этапов:
- [ ] `dist/en/index.html` содержит `<script type="application/ld+json">`
      ровно 2 раза (Organization + FAQPage); после Stage 9 — 2+N (где N
      = programmes count) + M (instructors count)
- [ ] Google Rich Results Test → eligible
- [ ] Schema.org Validator → 0 ошибок
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные
- [ ] Production deploy → `curl https://moiraionline.pro/en/ | grep -c application/ld+json` >= 2

## Out of scope

- **BreadcrumbList** — добавится с per-programme / per-journal
  страницами (Stage 9+).
- **VideoObject** для works коллекции — когда настроим R2 + video
  pipeline.
- **Article / NewsArticle** для journal — отдельно.
- **WebSite + SearchAction** — отказ: на сайте нет поиска, fake
  SearchAction = обман Google.
- **Review / AggregateRating** — нет данных, добавим когда появятся
  реальные отзывы.

## Critical files

- `src/lib/site-config.ts` (новый)
- `src/components/schema/OrganizationSchema.astro` (новый, активен сразу)
- `src/components/schema/FaqSchema.astro` (новый, активен сразу)
- `src/components/schema/CourseSchema.astro` (новый, активен Stage 9)
- `src/components/schema/PersonSchema.astro` (новый, активен Stage 9)
- `src/layouts/public/Layout.astro` (slot для schema)
- `src/pages/[locale]/index.astro` (подключение Org + FAQ)

## Reference

- `schema.org` — типы `EducationalOrganization`, `Course`,
  `CourseInstance`, `Person`, `FAQPage`
- Google Search Central — "Course (BETA)" structured data guide
- `docs/Home_page_SEO.md` §7-8 (исходный план Schema.org)
- `docs/Architecture.md` §4 (Content Collections shapes)
