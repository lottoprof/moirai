# Sprint 0 Stage 3 — Content Layer + First Page

## Context

После stage2 bootstrap (`757c575` configs + install, `dd7d91c` ADR)
проект собирается на пустом скелете. Stage 3 строит **минимальную
buildable главную страницу**:

1. CSS-переменные дизайн-системы как single source of truth
2. Auth-ready типы и root redirect
3. Voice guide для людей и агентов
4. Content Collections schemas (zod, build-time валидация)
5. Первый контент главной (home `en+ru`)
6. Layout + SeoHead компоненты
7. `[locale]/index.astro` — рендер home через секции (минимум, без
   стилизованных компонентов секций — это Stage 4+)

## Решения

- **Layered foundation first.** Сначала фундамент (tokens, types,
  middleware, schemas) — потом контент и страницы. Каждый коммит
  buildable, не блокирует остальные.
- **Translation pairs обязательны для home.** EN и RU создаются
  одновременно. Translation-pair validator (build-time скрипт) —
  отдельный stage позже.
- **Первая страница — stub-like.** Layout + SeoHead с правильной
  семантикой и meta-тегами; секции рендерятся как простые
  HTML-блоки без стилизации (стилизация — Stage 4+).
- **Source копирайта:** `docs/moirai_site_text.md` (утверждённый
  EN-текст). RU перевод — носителем; на этом этапе берём заглушку
  с `monolingual: true` ИЛИ переводим вручную с сверкой по
  voice-guide.

## Этапы

### ✅ 3a — `942897d` — design tokens

`src/styles/tokens.css` — все CSS-переменные из Design_system v0.1
§3-7, §11. Цвета (raw + semantic), типографика scale + tracking +
leading, spacing 4-point grid, layout (container), animation,
prefers-reduced-motion. Удалён `.gitkeep`.

### ✅ 3b — `9633f34` — env.d.ts + middleware

`src/env.d.ts` — `App.Locals extends Runtime<Env>` для declaration
merging middleware'ом. `src/middleware.ts` — root redirect `/` →
`/{locale}/` по Accept-Language + `X-Robots-Tag: noindex`
(Home_page_SEO §3, Architecture §3).

### ✅ 3c — `a2dd0c8` — voice guide

`src/content/voice-guide.md` — бренд-голос для людей и агентов.
Concrete не abstract, no fluff (stop-list), authority через
specificity, second-person, editorial не corporate, никаких AI
mentions, длина текстов по секциям, RU stop-list.

### ✅ 3d — `e6b2762` — content schemas

`src/content/config.ts` — zod для 7 коллекций (programmes,
bundles, instructors, segments, pages, journal, works). Shared
seoSchema, tierBaseSchema, bundleTierSchema (с
savings_vs_separate), tierFeaturesSchema (open-ended).
`monolingualField` opt-out для translation pairs.

### 🔜 3e — first content (home en + ru)

`src/content/pages/home.en.mdx` + `home.ru.mdx`. Frontmatter с
полным `seo` блоком + `sections` объектом (hero, ticker, who,
curriculum, included, instructors, after, pricing, faq, final_cta).

EN копирайт из `docs/moirai_site_text.md`. RU перевод —
с сверкой по `src/content/voice-guide.md`. Если RU черновой —
помечаем `monolingual: true` и пока работаем только с `/en/`.

### 🔜 3f — Layout + SeoHead

`src/components/public/SeoHead.astro` — генерит из frontmatter.seo:
- `<title>`, `<meta name="description">`
- `<link rel="canonical">`
- `<link rel="alternate" hreflang="...">` для всех локалей +
  `x-default`
- OpenGraph (`og:title`/description/image/locale/url) +
  Twitter Card (`twitter:card="summary_large_image"`)
- `<meta name="robots">` с `max-image-preview:large`

`src/layouts/public/Layout.astro` — корневой layout:
- `<html lang={locale}>`
- `<head>` с `<SeoHead {...seo} {locale} {pathname} />`
- preconnect/preload подсказки (без шрифтов пока — fonts.css
  отдельным stage)
- import `src/styles/tokens.css` глобально
- skip link `<a href="#main">`
- `<main id="main">` с слотами
- `<footer>` минимальный

### 🔜 3g — `[locale]/index.astro`

`src/pages/[locale]/index.astro`:
- `getStaticPaths()` для en + ru
- `getEntry("pages", \`home.${locale}\`)` — читает home.{locale}.mdx
- Рендер через Layout с frontmatter
- Каждая section — простой `<section>` с h2 + p + ul (без
  кастомных компонентов; это Stage 4+)
- `export const prerender = true` (статика по умолчанию для
  publicly-cached страниц, см. ADR `dd7d91c`)

## Verification (после каждого этапа)

```bash
pnpm lint                              # 0 errors
pnpm typecheck                         # 0 errors 0 warnings
pnpm build                             # после 3g: builds /en/ + /ru/
```

После всего блока:

```bash
pnpm exec wrangler pages dev ./dist    # локальный preview
# curl -I localhost:8788/                       → 302 to /en/
# curl localhost:8788/en/                       → home en HTML
# curl localhost:8788/ru/                       → home ru HTML
# проверить Schema.org в HTML, hreflang, canonical, OG
```

## Out of scope (следующие Sprint 0+ stages)

- **Stage 4 — стилизация.** Базовые element-стили (`base.css`),
  утилиты (`.stack-md`, `.cluster`, `.center`, `.eyebrow` и т.д.),
  компоненты `<Nav>`, `<Hero>`, `<Section>`, `<Card>`, `<Btn>`,
  `<Faq>`. После них главная начнёт выглядеть как `moirai-home.html`.
- **Stage 5 — fonts.** `public/fonts/cormorant-300.woff2`,
  `cormorant-300-italic.woff2`, `outfit-vf.woff2` + `fonts.css`
  (`@font-face` + size-adjust fallbacks). Нужны файлы шрифтов от
  пользователя.
- **Stage 6 — Schema.org компоненты.** `<OrganizationSchema>`,
  `<CourseSchema>`, `<PersonSchema>`, `<FaqSchema>` — генерация из
  Content Collections.
- **Stage 7 — translation-pair validator.** Build-time скрипт,
  падает если для id не все локали (или нет `monolingual: true`).
- **Stage 8 — PSI audit.** Доводка LCP/CLS/INP до 100/100 на mobile.
- **Stage 9 — программы/bundles/инструкторы first content.**
  Первые `programmes/beginner.{en,ru}.mdx` и
  `instructors/vladimir-popov.{en,ru}.mdx`.
- **Stage 10+ — dashboard, admin, api, D1, MoR.** Большой блок
  работы после публичного слоя.

## Critical files

- `/home/az/git/moirai/src/styles/tokens.css` (3a) ✅
- `/home/az/git/moirai/src/env.d.ts` (3b) ✅
- `/home/az/git/moirai/src/middleware.ts` (3b) ✅
- `/home/az/git/moirai/src/content/voice-guide.md` (3c) ✅
- `/home/az/git/moirai/src/content/config.ts` (3d) ✅
- `/home/az/git/moirai/src/content/pages/home.en.mdx` (3e) 🔜
- `/home/az/git/moirai/src/content/pages/home.ru.mdx` (3e) 🔜
- `/home/az/git/moirai/src/components/public/SeoHead.astro` (3f) 🔜
- `/home/az/git/moirai/src/layouts/public/Layout.astro` (3f) 🔜
- `/home/az/git/moirai/src/pages/[locale]/index.astro` (3g) 🔜

## Reference

- `docs/Architecture.md` §3 (i18n), §4 (content), §5 (programmes/
  tiers/bundles), §6 (структура сайта), §11 (agent workflow), §12
  (project deps)
- `docs/Design_system.md` §3-7 (tokens), §11 (animation), §12
  (структура home), §13 (perf strategies), §14 (a11y)
- `docs/Home_page_SEO.md` §3-9 (URL/canonical/hreflang, title/desc,
  H1-H3 hierarchy, секции, Schema.org, OG, internal linking),
  §10-11 (alt-strategy, perf↔SEO), §12 (sitemap/robots), §13 (voice
  recs)
- `docs/moirai_site_text.md` — утверждённый EN копирайт
- `docs/moirai-home.html` — визуальный референс (НЕ источник правды
  для кода — данные через Content Collections)
- `.agent/skills/astro/SKILL.md` — структура Astro 5, директивы
  гидрации, env.d.ts паттерн, middleware
- `.agent/rules/architecture.md`, `boundaries.md`, `forbidden.md`,
  `security.md`, `quality-gates.md`
