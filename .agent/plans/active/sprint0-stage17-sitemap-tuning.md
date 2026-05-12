# Sprint 0 Stage 17 — Sitemap tuning + final SEO polish

## Context

`@astrojs/sitemap` интеграция уже подключена (`astro.config.mjs`) и
генерирует `sitemap-index.xml` + `sitemap-0.xml` со всеми
prerendered routes. После Stage 12-16 в sitemap попадут:
home + programme pages + instructor pages + apply/waitlist/thanks +
faq/contact/legal + journal/works listings + per-entry pages.

Дефолтные настройки sitemap не идеальны:
- **Все URL имеют одинаковый priority и changefreq** — Google рекомендует
  дифференцировать.
- **`lastmod` отсутствует** — Google использует когда есть.
- **Apply / Thanks / DRAFT-legal не должны быть в sitemap** — это
  не публичный SEO-контент.
- **Admin / dev preview routes** должны быть исключены полностью.

Stage 17 — финальная доводка sitemap и связанной SEO-инфраструктуры
**перед** Stage 8 (PSI audit). Без этого PSI SEO-score может
показать 95+ но не 100 (особенно если в sitemap попадают noindex
страницы — это inconsistency penalty).

## Этапы

### 17a — sitemap config

`astro.config.mjs` — расширить sitemap integration:

```js
import sitemap from "@astrojs/sitemap";

sitemap({
  i18n: {
    defaultLocale: "en",
    locales: { en: "en", ru: "ru" },
  },
  filter: (page) => {
    // Исключения
    if (page.includes("/admin")) return false;
    if (page.includes("/_dev/")) return false;
    if (page.includes("/api/")) return false;
    if (page.endsWith("/thanks/") || page.endsWith("/thanks")) return false;
    return true;
  },
  serialize(item) {
    // Дифференцированный priority и changefreq
    const url = item.url;
    if (/\/(en|ru)\/$/.test(url)) {
      // Home
      item.priority = 1.0;
      item.changefreq = "weekly";
    } else if (/\/(beginner|intermediate)$/.test(url)) {
      // Programme pages
      item.priority = 0.9;
      item.changefreq = "monthly";
    } else if (/\/instructors\//.test(url)) {
      item.priority = 0.7;
      item.changefreq = "monthly";
    } else if (/\/journal\/(?!$)/.test(url)) {
      // journal posts (не index)
      item.priority = 0.6;
      item.changefreq = "yearly";
    } else if (/\/journal\/?$/.test(url) || /\/works\/?$/.test(url)) {
      // listing
      item.priority = 0.5;
      item.changefreq = "weekly";
    } else if (/\/legal\//.test(url)) {
      item.priority = 0.3;
      item.changefreq = "yearly";
    } else {
      item.priority = 0.5;
      item.changefreq = "monthly";
    }
    return item;
  },
});
```

### 17b — lastmod из content collections

`@astrojs/sitemap` не знает дату последнего изменения per-entry.
Чтобы добавить `lastmod`, нужно:

1. Каждая коллекция содержит дату в frontmatter (`updated_at` или
   `date`). Сейчас:
   - `journal` — `date: z.coerce.date()` ✓
   - `works`, `programmes`, `bundles`, `instructors`, `pages` —
     нет. Добавить `updated_at: z.coerce.date().optional()` в schemas.
2. Custom hook в `serialize` который получает дату из коллекции —
   но `@astrojs/sitemap` не передаёт entry data в serialize.
3. **Альтернатива:** написать custom sitemap-генератор Astro
   integration, читающий коллекции напрямую.

Решение для Stage 17 — минимальное: добавить `updated_at`
в schemas и пробросить через **build-time JSON** который читает
sitemap-генератор. Конкретная имплементация — внутри этапа,
решается во время.

Альтернатива: оставить без `lastmod` (Google и так работает без него).
Sitemap quality penalty в PSI на это нет.

### 17c — robots.txt (если не сделано в Stage 8g)

`public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /*?*       # игнорировать query params (apply prefill etc)

Sitemap: https://moiraionline.pro/sitemap-index.xml
```

Disallow `/*?*` — query string параметры (`/en/apply?programme=beginner&tier=live`)
не должны индексироваться как отдельные URL (canonical в head указывает
на чистый URL, но в robots.txt дополнительная защита).

### 17d — canonical для filtered URLs

Если на programme page приходит CTA с `?programme=...&tier=...`,
canonical в head должен указывать на чистый URL без query:

```astro
// в SeoHead.astro
const canonical = `${SITE.url}${Astro.url.pathname}`;
// → "https://moiraionline.pro/en/apply" (без query)
```

Текущий `SeoHead.astro` уже это делает (использует `pathname`, не
`href`). Проверить.

### 17e — `<meta name="robots">` для noindex routes

Sitemap exclude (17a filter) не достаточно — sitemap не публикуется
в robots, его узнают краулеры от Google Search Console. Чтобы
краулеры **не индексировали** noindex routes даже если найдут
их через другой путь — `<meta name="robots" content="noindex">`
в head.

Текущая логика в `SeoHead.astro`: `noindex` из `seo.noindex` frontmatter
поля → рендерит meta tag. Проверить что:

- `apply.astro`, `ai-module-waitlist.astro`, `thanks.astro` — у
  каждого `seo: { ..., noindex: true }`
- Legal DRAFT entries — `noindex: true`
- `/{locale}/_dev/theme-preview` — `noindex: true` (Stage 10)

### 17f — Open Graph image для не-главных страниц

Каждая страница должна иметь `og:image`. Сейчас:
- Главная — `media/og/home.{locale}.jpg` из frontmatter (но R2 файл
  не существует; OG-image broken)
- Programme/instructor pages — нет в frontmatter, будет fallback

Решение:
1. Добавить `default_og_image_r2_key` в site-config — глобальный
   fallback (например, `media/og/default.jpg` с логотипом + slogan)
2. SeoHead использует `seo.og_image ?? SITE.default_og_image`

Реальные OG images — после R2 setup + image pipeline. Сейчас —
placeholder URL (даже если 404, OG валидируется по URL формату).

### 17g — verification

```bash
pnpm build
# Sitemap
cat dist/sitemap-0.xml | xmllint --format -
# Проверить что:
# - admin/ routes исключены
# - thanks/ исключены
# - priority/changefreq разные для разных категорий
# - все URL имеют hreflang переключатель
```

Production:
- Submit `https://moiraionline.pro/sitemap-index.xml` в Google
  Search Console
- Bing Webmaster Tools — тоже submit
- Через ~24-48 ч Search Console покажет coverage report

## Verification

- [ ] `dist/sitemap-0.xml` содержит правильно категоризированные
      priority/changefreq
- [ ] admin, api, /_dev/, /thanks/, /draft/ routes отсутствуют в sitemap
- [ ] `robots.txt` отдаётся на проде, ссылка на sitemap правильная
- [ ] Noindex meta tag в head всех appropriate routes (`apply`,
      `thanks`, dev, DRAFT legal)
- [ ] `canonical` в head без query string на pages с ?params
- [ ] `og:image` присутствует на всех routes (даже placeholder URL)
- [ ] PSI SEO score = 100/100 на главной и programme pages
- [ ] Google Search Console accepts sitemap (no errors)

## Out of scope

- **Image OG generation dynamic** (Worker + satori) — отдельный
  stage когда настроим R2 + image pipeline.
- **`lastmod` точный per-entry** — если 17b сложно, оставляем без;
  Google и так индексирует.
- **Canonical для facet/filter URLs** — мы не используем facets/filters,
  не релевантно.
- **Hreflang validation external tool** (Sistrix / Ahrefs) —
  опционально, если будут SEO-аномалии.

## Critical files

- `astro.config.mjs` (sitemap config расширен)
- `public/robots.txt` (новый или обновлённый)
- `src/lib/site-config.ts` (default og_image)
- `src/components/public/SeoHead.astro` (canonical/og fallback)
- Per-page `astro.astro` файлы — добавить `noindex: true` в
  appropriate cases

## Dependencies

- **Stages 12-16** — все pages созданы (sitemap содержит реальные URL)
- **Stage 8** — финальная PSI прогонка делается ПОСЛЕ этого
  (Stage 8 проверяет финальный SEO score, Stage 17 готовит почву)

## Reference

- `@astrojs/sitemap` docs — filter, serialize hooks
- Google Search Central — sitemap protocol, lastmod, priority
- developer.mozilla.org — robots.txt format
- `docs/Home_page_SEO.md` §3, §11
