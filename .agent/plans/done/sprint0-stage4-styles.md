# Sprint 0 Stage 4 — Стилизация публичного слоя

## Context

После Stage 3 главная собирается stub-like (семантика без стилей).
Референс `docs/moirai-home.html` содержит ~840 строк inline CSS,
которые надо перенести в структурированные файлы:
- глобальные `base.css` + `utilities.css` под `<Layout>`
- per-component scoped `<style>` в `.astro` файлах под
  `src/components/public/`

Все стили используют `:root` переменные из `tokens.css` (Stage 3a) —
никаких raw hex/px в коде.

## Принципы

1. **Источник правды CSS** — `docs/moirai-home.html` (утверждённый
   референс). Адаптация под `tokens.css` переменные.
2. **Component-scoped CSS** — Astro `<style>` в каждом `.astro`
   компоненте. Глобальные — только base + utilities.
3. **BEM + utilities** (Design_system §8). Состояния — `is-*` или
   `aria-*`. JS-хуки — `data-*`.
4. **Anti-hardcode** — цены/числа НЕ свободным текстом, только
   через Content Collections (pre-commit hook ловит).
5. **Шрифты** — НЕ в этом stage. Используется fallback chain
   (Cormorant Fallback → Georgia → serif). Self-hosted woff2 — Stage 5
   когда появятся файлы.
6. **Прерываемость** — каждый под-этап оставляет рабочий build.

## Этапы

### 4a — foundation (base + utilities + Btn)
- `src/styles/base.css` — element reset, body, focus, a, ul/ol, img
- `src/styles/utilities.css` — `.h1`–`.h5`, `.eyebrow`,
  `.text-{muted,faint,accent}`, `.stack-{xs..2xl}`, `.cluster`,
  `.cluster--{sm,lg}`, `.center`, `.section`, `.section--{alt,cta}`,
  `.section__head`
- `src/components/public/Btn.astro` — `.btn`, `--primary`, `--ghost`,
  `--lg`, `--xl`, `.btn__arrow`. Hover-расширение gap.
- `Layout.astro` импортирует base + utilities

### 4b — page chrome (Nav + Footer)
- `src/components/public/Nav.astro` — `.nav`, fade-in после scroll,
  `.nav__logo`, `.nav__cta`. Без JS — CSS `animation-timeline: scroll()`
  с фолбэком.
- `src/components/public/Footer.astro` — `.footer`, `.footer__top`,
  `.footer__nav`, `.footer__copy`, `.footer__logo`. NAP + sitemap-ish
  links per Home_page_SEO §6.11.
- `Layout.astro` рендерит Nav (вне `<main>`) и Footer.

### 4c — hero block (Hero + Ticker)
- `src/components/public/Hero.astro` — `.hero`, `.hero__eyebrow`,
  `.hero__title`, `.hero__lede`, `.hero__cta`. `<em>` курсивом
  через `--text-accent-hover`.
- Stagger reveal: `@keyframes rise` с задержками 0.2/0.35/0.5/0.65s
  (Design_system §11). `prefers-reduced-motion: reduce` гасит.
- `src/components/public/Ticker.astro` — `.ticker`, `.ticker__track`,
  `.ticker__sep`, CSS animation `translateX` бесконечно.
  `aria-hidden="true"` (декорация).

### 4d — content blocks (карточки)
- `src/components/public/WhoCard.astro` — `.who-card`, `.who-grid`
- `src/components/public/FeatureItem.astro` — `.feature__title/body`,
  `.features-grid`
- `src/components/public/OutcomeItem.astro` — `.outcome__title/body`,
  `.outcomes-grid`
- `src/components/public/ProgrammeCard.astro` — `.programme-card`,
  `.programme-grid` (для Curriculum preview Beginner/Intermediate)
- `src/components/public/TierCard.astro` — placeholder
  (Stage 9 наполнит реальными данными из programmes/bundles)
- `src/components/public/InstructorCard.astro` — placeholder
  (Stage 9)

### 4e — finals (Faq + FinalCta + AiModule)
- `src/components/public/Faq.astro` — `.faq`, `.faq__item`,
  `.faq__question`, `.faq__answer`. `<details>/<summary>` нативный.
- `src/components/public/FinalCta.astro` — `.section--cta`,
  `.final-cta__title`, `.final-cta__lede`, `.urgency`,
  `.urgency__dot`.
- `src/components/public/AiModule.astro` — компонент с badge "Coming
  Soon" + waitlist CTA.

### 4f — integration
Заменить stub-разметку в `src/pages/[locale]/index.astro` компонентами
4a-4e. После этого главная визуально соответствует
`docs/moirai-home.html`.

## Verification

После каждого этапа:
```bash
pnpm lint && pnpm typecheck && pnpm build
```

После всех:
- Визуальная сверка с `docs/moirai-home.html` через
  `pnpm wrangler pages dev ./dist`
- A11y baseline: skip link, focus rings, aria-hidden на декорациях,
  alt-тексты, `<details>/<summary>` для FAQ, semantic HTML
- LCP — все ещё `<h1>` (текстовый), не картинка

## Out of scope (отдельные стадии)

- **Stage 5 — fonts.** `public/fonts/{cormorant-300,
  cormorant-300-italic,outfit-vf}.woff2` + `fonts.css` с `@font-face`
  и size-adjust fallbacks. Нужны файлы шрифтов от пользователя.
- **Stage 6 — Schema.org JSON-LD компоненты**
  (`<OrganizationSchema>`, `<CourseSchema>`, `<PersonSchema>`,
  `<FaqSchema>`).
- **Stage 7 — translation-pair build-time validator.**
- **Stage 8 — PSI audit.** Доводка LCP/CLS/INP до 100/100.
- **Stage 9 — первые реальные programmes/bundles/instructors
  файлы.** Тогда `TierCard` и `InstructorCard` начнут показывать
  реальные данные.
- **Иконки.** SVG sprite + `<Icon>` компонент — отдельно (нужны
  SVG-исходники иконок).

## Critical files

См. перечень в этапах 4a-4e + `src/layouts/public/Layout.astro`
(импорты base + utilities, рендер Nav+Footer) +
`src/pages/[locale]/index.astro` (4f integration).

## Reference

- `docs/moirai-home.html` — утверждённый CSS-референс (~840 строк
  inline `<style>`)
- `docs/Design_system.md` §3-13
- `docs/Home_page_SEO.md` §6 (структура секций), §11 (perf↔SEO)
- `src/styles/tokens.css` (Stage 3a) — все `:root` переменные
- `.agent/rules/architecture.md`, `boundaries.md`, `forbidden.md`
