# Sprint 0 Stage 10 — Light theme infrastructure (context-driven)

> **STATUS 2026-05-21:** Не начат, deferred.
> Триггер: после первой реальной правки body модуля методистом —
> станет ясно сколько текста в типичном reading region. Module page
> на dashboard сейчас рендерит markdown — первый кандидат для light theme
> когда body станет длинным (1000+ слов).
> Приоритет: низкий, UX-улучшение, не блокирует продажи.

## Context

`docs/Design_system.md` §4 ("Light theme variant") описывает
**точечную** светлую тему — применяется не page-wide, а к
content-регионам с длинным текстом, где тёмный фон утомляет на
15-30 минутах чтения.

Сейчас:
- `tokens.css` содержит только dark-theme переменные
- `<meta name="color-scheme" content="dark">` в `Layout.astro`
- Селектор `[data-theme="light"]` нигде не объявлен

Stage 10 кладёт инфраструктуру **до того** как появятся первые
страницы, которые её будут использовать (journal posts, dashboard
modules — это пост-Sprint 0). Когда они появятся, разметка просто
получает `data-theme="light"` атрибут — никаких дополнительных
изменений в стилях не потребуется.

## Принципы (из Design_system §4)

1. **Не page-wide.** Применяется к `<article>`/`<section>` региону,
   не к `<html>`/`<body>` целиком.
2. **Что остаётся тёмным** даже на этих страницах: `<nav>`,
   `<footer>`, видеоплеер, sidebar навигации в ЛК, hero/cover
   секция поста (паттерн "light-on-dark hero → dark-on-light
   reading body" из Medium/Substack).
3. **Темизация — только цветовые tokens.** Шрифты, spacing,
   typography scale, BEM-имена не меняются.
4. **Контраст amber поднимается.** Базовый `#D4820A` на светлом
   фоне даёт 3.8:1 (fail WCAG AA). Тёмный вариант `#B36F08` даёт
   5.1:1 (pass AA).
5. **НЕ user-toggle.** Это не кнопка-переключатель темы — это
   контекстная тема для длинного контента. User-facing theme
   switcher — отдельная задача, если когда-нибудь понадобится
   (расходится с Design_system §4).

## Этапы

### 10a — `src/styles/themes.css`

Новый файл (или раздел в `tokens.css` — решить в начале этапа;
рекомендую отдельный файл, чтобы tokens оставался компактным):

```css
/*
 * Light theme — точечная override через [data-theme="light"].
 * Применяется на content-региона (article, section), не на html/body.
 * См. docs/Design_system.md §4.
 */

[data-theme="light"] {
  /* Поверхности */
  --bg:               var(--paper);     /* #F7F3EC */
  --bg-elevated:      #FFFFFF;

  /* Текст */
  --text:             #1A1612;          /* ink-elevated, не чистый ink */
  --text-muted:       #4A413A;
  --text-faint:       #7A7168;

  /* Акцент — амбер темнее для AA контраста на светлом */
  --text-accent:       #B36F08;
  --text-accent-hover: #8A5506;
  --button-bg:         #B36F08;
  --button-bg-hover:   #8A5506;
  --button-text:       var(--paper);    /* инверсия */
  --link:              #B36F08;
  --link-hover:        #8A5506;

  /* Линии */
  --border:        rgba(13, 11, 9, 0.08);
  --border-strong: rgba(13, 11, 9, 0.16);

  /* Focus остаётся амбер (читабелен на светлом) */
  --focus-ring: #B36F08;
}
```

Подключение в `Layout.astro` импорт-цепочке **после** `tokens.css`,
но **до** `base.css` и компонентов (чтобы переменные были доступны
для базовых правил):

```ts
import "../../styles/tokens.css";
import "../../styles/fonts.css";    // Stage 5
import "../../styles/themes.css";   // ← новое
import "../../styles/base.css";
import "../../styles/utilities.css";
```

### 10b — meta color-scheme

`src/layouts/public/Layout.astro` обновить:

```astro
<meta name="color-scheme" content="dark light" />
```

`"dark light"` (в этом порядке) сообщает браузеру: страница умеет
обе темы, по умолчанию dark. Поведение native widgets (форма,
scrollbar) подстроится под region's `data-theme`.

### 10c — `prefers-reduced-motion` инвариант проверить

Хотя light theme не меняет animations, проверить что глобальное
правило `@media (prefers-reduced-motion: reduce)` (живёт в
`tokens.css`) работает одинаково в `[data-theme="light"]` контексте.
Тривиально: правило по `*`, не зависит от theme. Тест — DevTools
Rendering → emulate reduced motion → раскрыть FAQ item с
`data-theme="light"` → анимация маркера `+→×` погашена.

### 10d — verification page (опционально, dev-only)

Поскольку реальных страниц с long-form content (journal posts,
dashboard modules) пока нет, для визуальной валидации сделать
**временную dev-only страницу**:

`src/pages/[locale]/_dev/theme-preview.astro`:

```astro
---
/*
 * DEV-ONLY превью светлой темы. Не индексируется (noindex),
 * не в sitemap. Удаляется когда появятся реальные journal/dashboard
 * страницы с data-theme="light".
 *
 * Зачем существует: визуальный контроль контрастов, без необходимости
 * ждать Sprint 1+ (журнал/ЛК).
 */
import Layout from "../../../layouts/public/Layout.astro";
export const prerender = true;
export function getStaticPaths() {
  return [{ params: { locale: "en" } }, { params: { locale: "ru" } }];
}
---
<Layout
  locale={Astro.params.locale as "en" | "ru"}
  seo={{
    title: "Theme preview (dev)",
    description: "Internal preview of light theme tokens. Not for production.",
    noindex: true,
  }}>
  <article class="section" data-theme="light">
    <header class="section__head">
      <p class="eyebrow">Light theme preview</p>
      <h2 class="h2">Long-form reading region.</h2>
    </header>
    <p>Body text on paper background. The amber accent is darker
    (<span style="color:var(--text-accent)">like this</span>) for
    AA contrast on light background.</p>
    <p>Links: <a href="#test">a regular link</a>.</p>
  </article>
</Layout>
```

Подтвердить визуально на `/en/_dev/theme-preview` через
`wrangler pages dev ./dist`:
- `<nav>` и `<footer>` остаются тёмными (они вне `data-theme="light"`)
- `<article>` фон paper, текст ink, акценты в тёмном amber
- DevTools axe → контрасты AA pass

Эту страницу **не деплоить в production** — добавить exclude в
sitemap config + проверить `noindex` в head. Либо просто удалить
после того, как появятся реальные страницы (journal/dashboard).

### 10e — документация

В `docs/Design_system.md` §4 уже всё описано. Добавить ссылку
**отсюда** на инструкцию для разработчиков:

`docs/runbook-light-theme.md` (один экран):

```markdown
# Применение светлой темы

Добавить `data-theme="light"` на content-регион (article, section):

  <article data-theme="light">
    <!-- long-form text -->
  </article>

Стили автоматически переопределятся через CSS tokens. Шрифты,
spacing, BEM-классы остаются те же. Все child-элементы наследуют
переменные.

Где применять:
- /journal/[slug] — пост блога
- /dashboard/modules/[id] — body модуля
- /dashboard/materials/[id] — PDF preview

Где НЕ применять (всегда dark):
- <nav>, <footer> — page chrome консистентна
- Видеоплеер
- Sidebar dashboard
- Hero/cover секции

Полный спек: docs/Design_system.md §4.
```

## Verification

После всех этапов:
- [ ] `src/styles/themes.css` создан, содержит `[data-theme="light"]`
      переопределения 13 переменных (см. 10a)
- [ ] `Layout.astro` импортит `themes.css` после tokens, до base
- [ ] `<meta name="color-scheme" content="dark light">` в head
- [ ] `/en/_dev/theme-preview` рендерится локально с правильными
      контрастами (если 10d делается)
- [ ] axe DevTools на preview → 0 contrast violations
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные
- [ ] Главная (без `data-theme="light"`) визуально НЕ изменилась
      по сравнению с до-Stage-10

## Out of scope

- **User-facing theme toggle** (кнопка в Nav, `prefers-color-scheme`
  autodetect, localStorage memory, page-wide применение) —
  расходится с Design_system.md §4 "точечная, не page-wide".
  Отдельный stage если когда-нибудь будет product-решение
  отойти от текущего гайда.
- **Light theme для admin / dashboard** — admin остаётся тёмным
  (ops-tool, не reading context). Dashboard модули — частично
  light (тело модуля), но это применяется в Sprint 1+ когда
  модули появятся.
- **Контраст-тестирование для всех BEM-классов на светлом** —
  делается в `_dev/theme-preview`, но автоматизация (axe в CI)
  — отдельная задача.
- **Печатная (`@media print`) стилизация** — отдельно если
  понадобится.

## Critical files

- `src/styles/themes.css` (новый)
- `src/layouts/public/Layout.astro` (import + meta)
- `src/pages/[locale]/_dev/theme-preview.astro` (новый, dev-only)
- `docs/runbook-light-theme.md` (новый)

## Reference

- `docs/Design_system.md` §4 — full spec light theme variant
- `src/styles/tokens.css` — semantic tokens, которые light theme override'ит
- MDN — `color-scheme` meta
- WCAG 2.1 contrast guidelines
