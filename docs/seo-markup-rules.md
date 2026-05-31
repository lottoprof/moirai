# SEO & Markup Rules — moirai

> Чек-лист правил для публичных страниц, чтобы не наступать на одни
> и те же грабли. Источник: audit 2026-05-31.
>
> См. также:
> - `Home_page_SEO.md` — стратегия SEO для главной (FAQ, копирайт)
> - `works-and-journal-strategy.md` — роль /works и /journal в воронке
> - `Architecture.md` — структура сайта, биндинги

---

## 1. Source of truth для домена и брендинга

**НЕЛЬЗЯ** хардкодить домен (`https://moirai.film`, `https://moiraionline.pro`)
в коде компонентов и schema. Производственный домен может меняться,
и любая зашитая строка станет stale.

**Источник истины — `src/lib/site-config.ts`:**
```ts
export const SITE = {
  url: "https://moiraionline.pro",
  name: "Moirai",
  logo: "https://moiraionline.pro/favicon.svg",
  email: "hello@moiraionline.pro",
  social: [],
} as const;
```

**Использовать через импорт:**
```ts
import { SITE } from "../../lib/site-config";
// ...
publisher: { "@type": "Organization", name: SITE.name, url: SITE.url }
```

**Также:** `astro.config.mjs:8` `site:` и `SeoHead.astro:12` `SITE`
должны совпадать с `site-config.ts`. Менять все три одновременно.

**Grep before merge:**
```bash
grep -rn "moirai.film\|moiraionline.pro" src/ docs/ \
  | grep -v "site-config.ts\|astro.config.mjs\|SeoHead.astro\|media.moiraionline"
```
Должно быть пусто (кроме явно указанных конфигов).

---

## 2. `<head>` coverage — что обязано быть на каждой публичной странице

Реализовано в `src/components/public/SeoHead.astro`. Любая публичная
страница монтирует `<SeoHead locale={...} pathname={...} seo={...} />`
в `<Layout>`. Минимум на странице:

| Тег | Назначение | Источник |
|---|---|---|
| `<title>` | SERP title | `seo.title` |
| `meta description` | SERP snippet | `seo.description` |
| `link canonical` | absolute, per-locale | computed `${SITE}${pathname}` |
| `link alternate hreflang` | en, ru, x-default | computed `altPath()` |
| `meta robots` | conditional `noindex` | `seo.noindex` flag |
| `og:type, og:site_name` | OpenGraph | fixed |
| `og:locale` + `og:locale:alternate` | per-locale | en_US / ru_RU map |
| `og:url, og:title, og:description` | OG carousel | computed |
| `og:image` + `og:image:alt` | OG-картинка | `seo.og_image` или fallback |
| `twitter:card, twitter:title, twitter:description, twitter:image` | Twitter | fallback на og |
| `link icon` × 4 | favicons | static |
| `link preload font` × 2 | LCP-критичные шрифты | static |

**Правила:**
- Любая новая страница берёт `seo` из Content Collection frontmatter
  (`zod` schema в `src/content/config.ts` валидирует `seo.title`
  10-70 chars, `seo.description` 50-180 chars).
- `seo.noindex: true` ставится **на странице** для admin/dashboard/auth/
  checkout/verify-email — НЕ полагаемся только на sitemap exclusion.
- `og:image` — если нет per-page `seo.og_image`, используется
  `${SITE.url}${SITE.ogDefault}` = `https://moiraionline.pro/og-default.png`
  (1200×630, ink bg + amber Moirai mark + paper wordmark + tagline +
  домен). Реализовано в `SeoHead.astro:ogImageUrl`. PNG генерится
  `scripts/generate-og-default.mjs` через sharp; коммитится в
  `public/og-default.png` (~10 KB). Регенерим только при rebrand.

---

## 3. Sitemap — что включать, что исключать

`@astrojs/sitemap` integration в `astro.config.mjs` генерирует
`sitemap-index.xml` + `sitemap-0.xml` автоматически. Hreflang
alternates через `i18n: { defaultLocale, locales }` блок.

**Исключать через `filter`:**

```js
sitemap({
  i18n: { defaultLocale: "en", locales: { en: "en", ru: "ru" } },
  filter: (page) =>
    !page.includes("/admin/") &&
    !page.includes("/dashboard/") &&
    !page.includes("/checkout/") &&
    !page.includes("/verify-email-pending/") &&
    !page.includes("/inactive/") &&
    !page.includes("/account/"),
})
```

**Правило:** sitemap содержит только публичные SEO-страницы (главная,
программы, инструкторы, journal, works, legal, контакты, faq). Всё, что
требует auth — или транзакционное (checkout, verify) — **исключаем**.

`noindex` на странице — обязателен **дополнительно** (defense in depth).
Sitemap-исключение спасает от crawl-budget waste, `noindex` спасает
если страница оказалась в sitemap по ошибке.

---

## 4. Перформанс картинок

### LCP image (hero)

- `loading="eager"` — НЕ ленивая загрузка
- **`fetchpriority="high"`** — приоритет в очереди загрузки (даёт −300-800ms LCP на мобиле)
- `widths={[768, 1200, 1600, 2000, 2560]}` — responsive srcset
- `format="webp"` + `quality={75}` — оптимальный размер
- `sizes="100vw"` — для full-bleed hero

```astro
<Image
  src={bgImage}
  alt=""
  widths={[768, 1200, 1600, 2000, 2560]}
  sizes="100vw"
  format="webp"
  quality={75}
  loading="eager"
  fetchpriority="high"
/>
```

### Картинки below the fold

- `loading="lazy"` (default для Image)
- Не нужно `fetchpriority="high"`

### Alt-text

- **Декоративные** (`bg`, `hero__bg`, `play poster` рядом с title) → `alt=""`
  (signal к screen reader "skip me")
- **Контентные** (instructor portrait, work thumbnail рядом без title) →
  описательный alt
- **Никогда не пропускать атрибут** `alt` совсем — это lint error и a11y fail.

### Preload font

Critical шрифты (Cormorant + Manrope-vf) в `SeoHead.astro:73-77`:
```astro
<link rel="preload" href="/fonts/cormorant-300.woff2"
      as="font" type="font/woff2" crossorigin />
```
`crossorigin` обязателен даже для same-origin — без него preload
не match'ится с `@font-face` запросом и шрифт грузится дважды.

---

## 5. Schema.org coverage matrix

Доступные компоненты в `src/components/schema/`:

| Schema | Компонент | Где монтировать |
|---|---|---|
| Organization | `OrganizationSchema.astro` | Каждая публичная (через Layout) |
| Course | `CourseSchema.astro` | `/programmes/<id>` |
| Person | `PersonSchema.astro` | `/instructors/<id>` |
| FAQPage | `FaqSchema.astro` | `/`, `/faq` (split: home первые 6, faq остальные) |
| Article | `ArticleSchema.astro` | `/journal/<slug>` |
| VideoObject | `VideoObjectSchema.astro` | `/works/<slug>` (если `youtube_id` есть) |
| BreadcrumbList | **отсутствует** — TODO | `/journal/<slug>`, `/works/<slug>`, `/legal/<id>`, `/programmes/<id>` |

**Правила:**
- Schema.org `publisher` / `author` / `provider` / `url` поля — всегда
  через `SITE` из `site-config.ts`, не зашивать строкой.
- Не дублировать один schema на двух связанных страницах
  (см. FaqSchema split: home первые 6, /faq — `.slice(6)` остальные).
- `VideoObject.embedUrl` — `youtube.com/embed/` (не `youtube-nocookie`).
  Anti-bot challenges чаще на nocookie домене.

---

## 6. i18n routing

`astro.config.mjs`:
```js
i18n: {
  defaultLocale: "en",
  locales: ["en", "ru"],
  routing: { prefixDefaultLocale: true },  // /en/ explicit, /ru/ explicit
}
```

**Правила:**
- Каждый контентный entry — пара `<slug>.en.mdx` + `<slug>.ru.mdx`, либо
  `monolingual: true` на единственном файле. Валидация —
  `scripts/check-translation-pairs.mjs`.
- `slug` — **одинаковый** в обеих локалях (canonical-URL identity).
- Title / description / body — реальный перевод (не транслитерация,
  не machine translation без review). Качество RU = качество EN.
- Root `/` (без локали) — 301 redirect на `/en/` (см.
  `src/pages/index.astro`). НЕ 404, НЕ 200 заглушка — иначе Google
  индексирует пустой root.

---

## 7. Pre-merge SEO checklist для новой публичной страницы

Перед merge новой страницы (`src/pages/[locale]/...`):

- [ ] `<SeoHead locale={...} pathname={...} seo={...} />` в `<Layout>`
- [ ] Frontmatter `seo: { title, description }` валидирован zod
      (10-70 + 50-180 chars)
- [ ] Если auth-required / transactional → `seo.noindex: true`
- [ ] EN + RU пары созданы (или `monolingual: true`)
- [ ] Перевод RU реальный (не auto без review)
- [ ] LCP-картинка с `fetchpriority="high"`, остальные `loading="lazy"`
- [ ] Все `<img>` имеют `alt` (даже `alt=""` для декоративных)
- [ ] Соответствующий Schema.org компонент смонтирован
      (см. matrix §5)
- [ ] Если страница transactional/auth — добавлена в `sitemap` filter
      (см. §3)
- [ ] `pnpm lint && pnpm typecheck && pnpm build` — зелёные
- [ ] Локальная проверка в браузере DevTools: title, description,
      canonical, hreflang en/ru/x-default, og:image отдают значения
      (не undefined)

---

## 8. Anti-checklist — частые ошибки

- ❌ Хардкод `https://moirai.film` или `https://moiraionline.pro` в
  компонентах вместо `SITE.url`
- ❌ `<img>` без `alt`
- ❌ LCP `<Image>` без `fetchpriority="high"`
- ❌ Schema.org с `url: "https://hardcoded-domain..."`
- ❌ Transactional / auth страницы в sitemap без `noindex`
- ❌ Дубль одного schema на двух связанных страницах (одинаковый FAQPage
  на home и /faq — Google понизит обе)
- ❌ Slug разный в EN и RU (`/en/works/quiet-room` vs `/ru/works/тихая-комната`)
- ❌ RU контент через auto-translate без review (Google понизит ranking,
  читатель уйдёт)
- ❌ Машинописный перевод заголовков (`title: "Тихая комната"` → ок;
  `title: "Quiet Room"` на /ru/ → плохо)
