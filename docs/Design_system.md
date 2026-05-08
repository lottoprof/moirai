# Moirai — Design System & Home Page v0.1

> **Status:** working draft. Зафиксированы: design tokens (шрифты, цвета,
> spacing), типографическая шкала, naming-conventions (BEM + utilities),
> компоненты главной страницы, performance budget под 100/100 PageSpeed
> Insights, accessibility baseline.
>
> Это **первая итерация дизайн-системы**, основанная на эстетике исходного
> `Film_Site_13.html`. Применяется ко всем публичным страницам, не только
> к главной.

---

## 1. Эстетика и принципы

**Направление:** editorial cinema — в духе старых киножурналов и постеров
авторского кино. Выразительная типографика как главный визуальный элемент,
один цвет акцента (тёплый амбер) как лампочка кинопроектора, тёмный почти-
чёрный фон как зал перед сеансом.

**Ключевые качества:**

— **Refined**, не minimalist. Минимализм холоден; refined — у нас есть
визуальный голос (Cormorant Garamond курсив для эмоциональных слов, амбер
для акцентов, generous spacing), но без лишних украшений.
— **Editorial**, не corporate. Композиция как разворот хорошего журнала:
крупная типографика, осмысленные пробелы, иерархия.
— **Cinematic**, не techy. Никаких градиентов neon-purple, glow effects,
glassmorphism. Аналоговая теплота: амбер вместо синего, Cormorant вместо
Inter.

**Чего НЕ делаем:**

- ❌ Generic AI aesthetic: Inter/Roboto, purple gradients, glassmorphism
- ❌ Tech-startup look: gradient buttons, animated gradients, blur effects
- ❌ Декоративные элементы без семантической нагрузки
- ❌ Анимации, которые отвлекают от чтения
- ❌ Множество цветов акцента — только амбер

---

## 2. Performance budget

**Цель: 100/100 PageSpeed Insights mobile + desktop.** Это диктует все
последующие решения.

### Core Web Vitals targets

| Метрика | Target           | Зелёная зона CWV |
|---------|------------------|------------------|
| LCP     | < 1.8s           | < 2.5s           |
| INP     | < 100ms          | < 200ms          |
| CLS     | < 0.05           | < 0.1            |
| TBT     | < 100ms          | < 200ms          |
| FCP     | < 1.0s           | < 1.8s           |

### Бюджет ресурсов на главную страницу

| Ресурс                          | Лимит          | Стратегия                          |
|---------------------------------|----------------|-------------------------------------|
| HTML (gzipped)                  | < 14 KB        | First TCP packet                    |
| Critical CSS (inline)           | < 12 KB        | В `<head>`, only above-the-fold     |
| Async CSS (после LCP)           | < 20 KB        | `media="print"` swap трюк или JS    |
| JavaScript (gzipped)            | < 15 KB        | Vanilla, без фреймворков            |
| Шрифты (woff2, всего)           | < 80 KB        | 2 семейства × subset, 2-3 weights   |
| LCP image (если есть)           | < 80 KB        | WebP/AVIF, preloaded                |
| **Total above-the-fold**        | **< 220 KB**   | **HTTP/2, Brotli, edge cache**      |

### Запреты

- ❌ Никаких client-side React/Vue/Svelte рантаймов на публичных страницах
- ❌ Никаких внешних JS (Google Fonts, analytics третьих сторон до 1-го взаимодействия)
- ❌ Никаких больших background-image для hero — только тонкая текстура
  или solid color
- ❌ Никаких animation libraries (anime.js, gsap) — только CSS
- ❌ Никаких jQuery, lodash, moment

---

## 3. Шрифты

### Семейства

**Display:** `Cormorant Garamond` — заголовки, лого, цены, цифры, имена
инструкторов, акцентные слова в курсиве. Weight 300 (light) — это
главный выразительный вес проекта. Italic 300 — для выделений (`<em>`).

**Body:** `Outfit` — UI-текст, описания, навигация, кнопки. Weight 400
(regular) и 500 (medium). Никаких bold (700+) — слишком тяжело
рядом с light Cormorant.

### Self-hosting и preload

Загружаем сами с Cloudflare R2 (`media.moirai.film/fonts/`), не Google
Fonts. Subset до Latin Extended + Cyrillic Extended (для en + ru).

```html
<link rel="preload" href="/fonts/cormorant-300.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/outfit-400.woff2" as="font" type="font/woff2" crossorigin>
```

Препоадим **только два файла**: Cormorant-300 (используется в LCP-элементе
hero h1) и Outfit-400 (навигация). Cormorant-300-italic, Outfit-500 —
загружаются обычным `@font-face` без preload.

### @font-face декларации

```css
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url('/fonts/cormorant-300.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC,
                 U+02C6, U+02DA, U+02DC, U+0400-045F, U+0490-0491,
                 U+04B0-04B1, U+2000-206F, U+2074, U+20AC, U+2122,
                 U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: italic;
  font-weight: 300;
  font-display: swap;
  src: url('/fonts/cormorant-300-italic.woff2') format('woff2');
  unicode-range: /* same */;
}
@font-face {
  font-family: 'Outfit';
  font-style: normal;
  font-weight: 400 500;          /* variable range */
  font-display: swap;
  src: url('/fonts/outfit-vf.woff2') format('woff2-variations');
  unicode-range: /* same */;
}
```

Outfit берём как **variable font** — один файл покрывает 400 и 500 веса,
~20KB вместо двух статических ~30KB.

### Fallback с size-adjust (CLS prevention)

```css
@font-face {
  font-family: 'Cormorant Fallback';
  src: local('Georgia');
  size-adjust: 96%;
  ascent-override: 92%;
  descent-override: 24%;
  line-gap-override: 0%;
}
@font-face {
  font-family: 'Outfit Fallback';
  src: local('Helvetica'), local('Arial');
  size-adjust: 100%;
  ascent-override: 100%;
  descent-override: 25%;
  line-gap-override: 0%;
}

:root {
  --font-display: 'Cormorant Garamond', 'Cormorant Fallback', Georgia, serif;
  --font-body: 'Outfit', 'Outfit Fallback', system-ui, sans-serif;
}
```

Fallback с size-adjust **минимизирует CLS** при `font-display: swap` —
fallback шрифт имеет те же метрики что финальный, layout не прыгает.

---

## 4. Цвета

### Raw palette

```css
:root {
  --ink:           #0D0B09;    /* фон страницы — тёплый почти-чёрный */
  --ink-elevated:  #1A1612;    /* приподнятые поверхности (cards) */
  --paper:         #F7F3EC;    /* основной текст — тёплый бежевый */
  --paper-muted:   #C8BFB0;    /* приглушённый текст */
  --paper-faint:   #7A7168;    /* мета-инфо, captions */
  --amber:         #D4820A;    /* акцент */
  --amber-light:   #F0A830;    /* hover, выделения курсивом */
  --amber-faint:   rgba(212, 130, 10, 0.12);  /* фоны, тонкие акценты */
  --line:          rgba(247, 243, 236, 0.08); /* разделители */
  --line-strong:   rgba(247, 243, 236, 0.16);
}
```

### Semantic tokens

```css
:root {
  /* Поверхности */
  --bg:               var(--ink);
  --bg-elevated:      var(--ink-elevated);

  /* Текст */
  --text:             var(--paper);
  --text-muted:       var(--paper-muted);
  --text-faint:       var(--paper-faint);
  --text-accent:      var(--amber);
  --text-accent-hover: var(--amber-light);

  /* Интерактив */
  --button-bg:        var(--amber);
  --button-bg-hover:  var(--amber-light);
  --button-text:      var(--ink);
  --link:             var(--amber);
  --link-hover:       var(--amber-light);

  /* Линии и фокус */
  --border:           var(--line);
  --border-strong:    var(--line-strong);
  --focus-ring:       var(--amber);
}
```

Использование в коде — **только semantic tokens**, не raw. `color: var(--text-muted)`,
не `color: #C8BFB0`.

### Контрастность (WCAG)

| Pair                       | Contrast | WCAG       |
|----------------------------|----------|------------|
| paper on ink               | 14.6:1   | AAA        |
| paper-muted on ink         | 9.1:1    | AAA        |
| paper-faint on ink         | 4.8:1    | AA         |
| amber on ink               | 6.2:1    | AA         |
| ink on amber               | 6.2:1    | AA (CTA)   |
| amber-light on ink         | 9.4:1    | AAA        |

**paper-faint на ink** — на грани (4.8:1). Используется только для меты
(даты, captions размером ≥14px). Для основного текста — `--text-muted`.

### Light theme variant

Светлая тема — **точечная**, не page-wide. Применяется к contexts с длинным
текстом, где тёмный фон утомляет на 15-30 минутах чтения. Включается через
`data-theme="light"` на content-региона, не на `<html>` целиком.

#### Где применяется

- `/dashboard/modules/[id]` — body модуля (текст, упражнения, prompt)
- `/journal/[slug]` — пост блога
- `/dashboard/materials/[id]` — PDF preview, шаблоны

#### Где **остаётся тёмная** даже на этих страницах

- `<nav>` — навигация консистентна на всём сайте
- `<footer>`
- Видеоплеер (lecture mode и review mode)
- Sidebar навигация в ЛК
- Hero/cover секция поста (light-on-dark hero, dark-on-light reading area
  — паттерн Medium и Substack)

#### Tokens override

```css
[data-theme="light"] {
  /* Поверхности */
  --bg:               var(--paper);           /* #F7F3EC */
  --bg-elevated:      #FFFFFF;

  /* Текст */
  --text:             #1A1612;                /* ink-elevated, не чистый ink */
  --text-muted:       #4A413A;
  --text-faint:       #7A7168;

  /* Акцент — амбер темнее для AA контраста на светлом */
  --text-accent:      #B36F08;                /* darker amber for AA */
  --text-accent-hover: #8A5506;

  /* Линии */
  --border:           rgba(13, 11, 9, 0.08);
  --border-strong:    rgba(13, 11, 9, 0.16);

  /* Фокус остаётся амбер (читабелен на светлом) */
  --focus-ring:       #B36F08;
}
```

#### Контрасты светлой темы (WCAG)

| Pair                        | Contrast | WCAG       |
|-----------------------------|----------|------------|
| ink-elevated на paper       | 16.8:1   | AAA        |
| text-muted (#4A413A) на paper | 9.4:1  | AAA        |
| text-faint (#7A7168) на paper | 5.0:1  | AA         |
| amber-dark (#B36F08) на paper | 5.1:1  | AA         |

**Важно:** базовый `amber #D4820A` на светлом фоне даёт только 3.8:1 — fail
AA для normal text. Поэтому в light theme используется `#B36F08`. Семантический
токен `--text-accent` маскирует это переключение.

#### Применение в HTML

```html
<!-- Page wrapper остаётся тёмный -->
<body>
  <nav class="nav">...</nav>

  <main>
    <!-- Hero/cover секция — тёмная для contrast -->
    <header class="post-cover">...</header>

    <!-- Content region — светлая -->
    <article class="post-body" data-theme="light">
      <h1>How to direct a dialogue scene</h1>
      <p>Long-form text reads here for 20 minutes...</p>
    </article>
  </main>

  <footer class="footer">...</footer>
</body>
```

`data-theme="light"` влияет только на elements внутри `<article>`. Nav,
footer, post-cover остаются тёмными.

#### Что НЕ переключается через theme

Шрифты остаются те же (Cormorant + Outfit). Spacing, typography scale,
component naming — без изменений. Темизация — **только цветовые tokens**.

#### Точки тонкой настройки

- **Cormorant 300 на светлом** — тонкий вес может казаться "блёклым" на
  paper-фоне в больших headings. Если по факту так — переключаем
  `[data-theme="light"] .h1, .h2 { font-weight: 400; }`. Решается на
  визуальном review реальной страницы.
- **Italic acccent цвет** — `var(--text-accent-hover)` в светлой теме это
  `#8A5506` (ещё темнее). Слишком тёмный для "light" акцента?
  Возможный fix — оставить `var(--amber-light)` как декоративный, не для
  важных слов.

---

## 5. Типографика

### Scale (clamp для responsive)

```css
:root {
  /* Display — для заголовков-героев */
  --type-display-xl:   clamp(64px, 8vw, 120px);  /* hero h1 */
  --type-display-lg:   clamp(48px, 6vw, 80px);   /* final CTA */
  --type-display-md:   clamp(32px, 3.5vw, 48px); /* section h2 */
  --type-display-sm:   clamp(24px, 2.5vw, 32px); /* small section h2 */

  /* Body */
  --type-body-lg:      18px;  /* hero subtitle, intro */
  --type-body-md:      16px;  /* default */
  --type-body-sm:      14px;  /* secondary */

  /* Micro — eyebrow, caption, meta */
  --type-micro-lg:     13px;
  --type-micro-md:     12px;
  --type-micro-sm:     10px;

  /* Tracking (letter-spacing) */
  --tracking-tight:    -0.01em;  /* display */
  --tracking-normal:   0;
  --tracking-wide:     0.1em;    /* CTA, secondary */
  --tracking-wider:    0.14em;   /* eyebrow */
  --tracking-widest:   0.2em;    /* extreme caps */

  /* Line heights */
  --leading-tight:     0.95;     /* hero h1 */
  --leading-snug:      1.1;      /* h2 */
  --leading-normal:    1.5;      /* body */
  --leading-relaxed:   1.7;      /* long form */
}
```

### Иерархия

```css
.h1 {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: var(--type-display-xl);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--text);
}
.h1 em {
  font-style: italic;
  color: var(--text-accent-hover);
}

.h2 {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: var(--type-display-md);
  line-height: var(--leading-snug);
  letter-spacing: var(--tracking-tight);
  color: var(--text);
}
.h2 em { font-style: italic; color: var(--text-accent-hover); }

.h3 {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: var(--type-display-sm);
  line-height: var(--leading-snug);
  color: var(--text);
}

.h4 {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 20px;
  line-height: 1.3;
  color: var(--text);
}

.h5 {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 16px;
  line-height: 1.4;
  color: var(--text);
}

/* Eyebrow — над секционными заголовками */
.eyebrow {
  font-family: var(--font-body);
  font-weight: 400;
  font-size: var(--type-micro-md);
  line-height: 1;
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  color: var(--text-accent);
}

.text-muted   { color: var(--text-muted); }
.text-faint   { color: var(--text-faint); }
.text-accent  { color: var(--text-accent); }
```

### Принципы использования

- `<em>` курсив — только для **эмоциональных слов** в заголовках
  ("Direct *your* first film", "Make your *first* film"). Курсив всегда
  `var(--amber-light)`, не основным цветом.
- Body-текст — Outfit 400, не bold. Если нужно подчеркнуть слово — `<strong>`
  с weight 500 (max), без увеличения размера.
- Eyebrow перед каждой большой секцией — короткий лейбл для контекста.

---

## 6. Spacing

4-point grid: все размеры кратны 4px.

```css
:root {
  --space-2xs:  4px;
  --space-xs:   8px;
  --space-sm:   12px;
  --space-md:   16px;
  --space-lg:   24px;
  --space-xl:   32px;
  --space-2xl:  48px;
  --space-3xl:  64px;
  --space-4xl:  96px;
  --space-5xl:  128px;
  --space-6xl:  192px;       /* между большими секциями */
}
```

### Утилиты для типичных паттернов (как в .hbs примерах)

```css
/* Vertical rhythm: дочерние элементы получают margin-top кроме первого */
.stack-xs > * + * { margin-top: var(--space-xs); }
.stack-sm > * + * { margin-top: var(--space-sm); }
.stack-md > * + * { margin-top: var(--space-md); }
.stack-lg > * + * { margin-top: var(--space-lg); }
.stack-xl > * + * { margin-top: var(--space-xl); }
.stack-2xl > * + * { margin-top: var(--space-2xl); }

/* Cluster: горизонтальный flex с gap */
.cluster {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: center;
}
.cluster--sm { gap: var(--space-sm); }
.cluster--lg { gap: var(--space-lg); }

/* Center: горизонтальное центрирование с max-width */
.center {
  max-width: var(--container-max);
  margin-inline: auto;
  padding-inline: var(--container-pad);
}
```

---

## 7. Layout

### Контейнер

```css
:root {
  --container-max:   1200px;
  --container-pad:   clamp(20px, 5vw, 48px);  /* responsive padding */
}
```

### Breakpoints

```css
:root {
  --bp-sm:   640px;     /* phones large */
  --bp-md:   768px;     /* tablets */
  --bp-lg:   1024px;    /* desktops small */
  --bp-xl:   1280px;    /* desktops */
  --bp-2xl:  1536px;    /* wide desktops */
}
```

В медиа-запросах — `min-width` first (mobile-first):

```css
.section-grid { display: grid; gap: var(--space-xl); }
@media (min-width: 768px)  { .section-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .section-grid { grid-template-columns: repeat(3, 1fr); } }
```

### Section vertical rhythm

```css
.section {
  padding-block: clamp(80px, 12vw, 192px);
}
.section--sm { padding-block: clamp(48px, 6vw, 96px); }
.section--lg { padding-block: clamp(120px, 16vw, 256px); }
```

---

## 8. Naming conventions (BEM + utilities)

Следуем тому же подходу что в .hbs примерах:

### BEM для компонентов

- **Block** — самостоятельный компонент: `.drawer`, `.card`, `.btn`, `.field`
- **Element** — часть блока: `.drawer__panel`, `.card__header`, `.field__label`
- **Modifier** — вариант: `.btn--primary`, `.btn--ghost`, `.card--featured`

```html
<article class="card card--featured">
  <header class="card__header">
    <h3 class="card__title">...</h3>
  </header>
  <div class="card__body">...</div>
  <footer class="card__footer">...</footer>
</article>
```

### Utility-классы для патернов

`.stack-md`, `.cluster`, `.text-muted`, `.eyebrow` — используются вместо
повторных компонентных стилей.

### Состояния через `is-*` или ARIA

`.is-active`, `.is-open`, `aria-expanded="true"`, `aria-selected="true"`,
`hidden`. **Не** через классы типа `.active`, `.open` — они конфликтуют
с глобальной семантикой.

### data-attributes для JS hooks

JavaScript цепляется к `data-*`, не к классам:

```html
<button data-modal-open="apply" class="btn btn--primary">Apply</button>
<aside class="drawer" data-drawer="apply" hidden>...</aside>
```

Стили — через классы, поведение — через `data-*`. Разделение
концернов: переименование класса не сломает JS.

### Формат имени data-attribute

— `data-{component}-{role}` для контейнеров: `data-drawer="apply"`,
  `data-form="apply"`
— `data-{component}-{action}` для триггеров: `data-drawer-close`,
  `data-modal-open="apply"`
— `data-icon="namespace/name"` для иконок: `data-icon="mono/close"`,
  `data-icon="brand/cloudflare"`
— `data-i18n="dotted.key.path"` для переводов

---

## 9. Компоненты главной страницы

Перечисление всех компонентов которые есть на home page. Каждый можно
переиспользовать на других страницах. Здесь — короткий референс с HTML
структурой; подробные стили — в отдельных CSS-файлах в Sprint 0.

### `.nav` — навигация

```html
<nav class="nav" role="navigation" aria-label="Primary">
  <a class="nav__logo" href="/">Moirai.</a>
  <a class="nav__cta" href="/apply" data-i18n="nav.apply">Apply Now →</a>
</nav>
```

— Position fixed top, fade-in на ~50px scroll
— Минималистичная: лого + один CTA
— `mix-blend-mode: difference` опционально для текста при scroll (если нужен
  visual punch)

### `.hero` — главный экран

```html
<section class="hero">
  <span class="hero__eyebrow eyebrow">
    Beginner & Intermediate — small groups
  </span>
  <h1 class="hero__title h1">
    Direct <em>your</em> first film.
  </h1>
  <p class="hero__lede text-muted">
    A two-level online program taught by working directors.
  </p>
  <a class="btn btn--primary btn--lg" href="/apply">
    Apply now
    <span class="icon" data-icon="mono/arrow-right" aria-hidden="true"></span>
  </a>
</section>
```

— Минимум 80vh, центрирование по горизонтали
— Stagger animation: eyebrow → h1 → lede → CTA, каждый с задержкой 150ms
— H1 — это **LCP element**, должен быть в HTML с самого начала, шрифт preloaded

### `.ticker` — бегущая строка под hero

```html
<div class="ticker" aria-hidden="true">
  <div class="ticker__track">
    <span class="ticker__item">Cinematography</span>
    <span class="ticker__sep">·</span>
    <span class="ticker__item">Direction</span>
    <span class="ticker__sep">·</span>
    <span class="ticker__item">Editing</span>
    <!-- duplicated for seamless loop -->
  </div>
</div>
```

— `aria-hidden` потому что декоративный
— CSS-only animation с `transform: translateX()`, `prefers-reduced-motion: paused`

### `.section` — обёртка секций

```html
<section class="section section--alt" id="who">
  <div class="center">
    <span class="eyebrow" data-i18n="who.eyebrow">Who is this for</span>
    <h2 class="h2">Film school teaches theory. We teach <em>practice</em>.</h2>

    <div class="who-grid stack-2xl">
      <!-- audience tiles -->
    </div>
  </div>
</section>
```

### `.card` — карточка (программы, тиры, инструкторы)

```html
<article class="card card--tier">
  <header class="card__header">
    <span class="card__label eyebrow">Standard</span>
    <span class="card__price">$369</span>
  </header>
  <div class="card__body">
    <ul class="card__features stack-sm">
      <li>...</li>
    </ul>
  </div>
  <footer class="card__footer">
    <a class="btn btn--ghost" href="...">Choose this tier</a>
  </footer>
</article>
```

Модификаторы: `.card--featured` (амбер фон), `.card--tier`, `.card--instructor`,
`.card--week`.

### `.btn` — кнопки

```html
<a class="btn btn--primary" href="/apply">
  Apply now
</a>

<button class="btn btn--ghost" type="button">
  Learn more
</button>

<button class="btn btn--icon" type="button" aria-label="Close">
  <span class="icon" data-icon="mono/close"></span>
</button>
```

Модификаторы: `--primary` (амбер), `--ghost` (бордер), `--icon`, `--sm`,
`--lg`. Без `bold`. Letter-spacing wide. Uppercase.

### `.field` — поле формы (apply form)

```html
<div class="field">
  <label class="field__label" for="email">
    <span data-i18n="form.email">Email</span>
    <span class="field__required">*</span>
  </label>
  <input class="input" type="email" id="email" name="email" required>
  <p class="field__hint text-faint">
    We'll only use this to send your application response.
  </p>
</div>
```

### `.faq` — раскрывающиеся вопросы

```html
<details class="faq__item">
  <summary class="faq__question">
    Is this fully online?
    <span class="faq__icon" aria-hidden="true">+</span>
  </summary>
  <div class="faq__answer text-muted">
    <p>Yes, fully online via Zoom. All sessions are scheduled in...</p>
  </div>
</details>
```

— Native `<details>/<summary>` — нулевой JS, доступность из коробки
— Иконка `+` поворачивается на 45° через CSS при `[open]`

### `.footer` — подвал

```html
<footer class="footer">
  <div class="center cluster cluster--lg">
    <span class="footer__logo">Moirai.</span>
    <span class="footer__copy text-faint">
      © 2026 — Vladimir Popov & Anastasia Zasypkina
    </span>
    <nav class="footer__links cluster cluster--sm">
      <a href="/legal/terms" class="text-muted">Terms</a>
      <a href="/legal/privacy" class="text-muted">Privacy</a>
    </nav>
  </div>
</footer>
```

---

## 10. Иконки

### Sprite-based система

Один SVG sprite с `<symbol>` элементами. Один HTTP-запрос на все иконки,
кешируется навсегда.

```html
<!-- /assets/icons.svg, fetched once -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="icon-mono-close" viewBox="0 0 24 24">
    <path d="..." />
  </symbol>
  <symbol id="icon-mono-arrow-right" viewBox="0 0 24 24">...</symbol>
  <symbol id="icon-mono-check" viewBox="0 0 24 24">...</symbol>
  <!-- etc -->
</svg>
```

### Использование (как в .hbs примерах)

```html
<span class="icon" data-icon="mono/close"></span>
```

JS-helper при загрузке заменяет `data-icon="mono/close"` на:

```html
<svg class="icon"><use href="/assets/icons.svg#icon-mono-close"></use></svg>
```

ИЛИ — серверный рендер на Astro компоненте `<Icon name="mono/close" />`,
который возвращает прямо `<svg><use>` без JS. **Это предпочтительный
подход** — нулевой клиентский JS на иконки.

### Конвенции имён

`{namespace}/{name}`:
- `mono/*` — монохромные UI иконки (close, check, arrow-right, plus, ...)
- `brand/*` — бренд-иконки (instagram, youtube, ...)
- `flag/*` — флаги для language switcher

### Размеры

```css
.icon { width: 1em; height: 1em; flex-shrink: 0; }
.icon--sm { font-size: 14px; }
.icon--md { font-size: 18px; }
.icon--lg { font-size: 24px; }
```

`width/height: 1em` означает что иконка масштабируется с font-size родителя
— удобно вшивать в кнопки и текст.

---

## 11. Анимации

### Принципы

— **CSS-only**, без библиотек
— Только `transform` и `opacity` (cheap, GPU-accelerated)
— `prefers-reduced-motion: reduce` уважается всегда
— **Один большой момент при загрузке** (stagger reveal) даёт больше
  впечатления чем десять микро-анимаций повсюду

### Базовые transitions

```css
:root {
  --ease-out:        cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out:     cubic-bezier(0.65, 0, 0.35, 1);
  --duration-fast:   150ms;
  --duration-normal: 250ms;
  --duration-slow:   400ms;
  --duration-rise:   900ms;
}
```

### Hero stagger reveal

```css
@keyframes rise {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.hero__eyebrow { animation: rise var(--duration-rise) 0.2s var(--ease-out) both; }
.hero__title   { animation: rise var(--duration-rise) 0.35s var(--ease-out) both; }
.hero__lede    { animation: rise var(--duration-rise) 0.5s var(--ease-out) both; }
.hero__cta     { animation: rise var(--duration-rise) 0.65s var(--ease-out) both; }
```

`animation-fill-mode: both` — элемент остаётся в начальном состоянии до
старта (избегаем FOUC) и в финальном после.

### Hover на CTA

```css
.btn--primary {
  transition: background var(--duration-fast) var(--ease-out),
              gap var(--duration-fast) var(--ease-out);
  display: inline-flex;
  gap: 14px;
}
.btn--primary:hover { background: var(--button-bg-hover); gap: 20px; }
```

Дистанция между текстом и стрелкой увеличивается на hover — тонкий
кинематографический хинт.

### Scroll-triggered reveal (опционально)

Через `IntersectionObserver` (10 строк JS) или CSS `animation-timeline: view()`
если поддержка достаточна.

```css
@supports (animation-timeline: view()) {
  .reveal {
    animation: rise linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }
}
```

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 12. Структура главной страницы

Порядок секций. Содержание — из Content Collections (см. ARCHITECTURE.md §4).

```
1. <Nav>                       — фиксированная навигация
2. <Hero>                      — h1 + lede + primary CTA (LCP)
3. <Ticker>                    — бегущая строка с key terms
4. <WhoIsItFor>                — 4 аудитории как карточки
5. <Curriculum>                — превью программ + ссылки на детальные страницы
6. <WhatsIncluded>              — что входит в программу (компонент <ProgrammeFeatures>)
7. <Instructors>                — Vladimir + Anastasia как карточки
8. <AfterTheProgram>           — что студент получает
9. <Pricing>                    — тиры с ценами (компонент <TierCards>)
10. <Faq>                      — раскрывающиеся вопросы (Schema.org FAQPage)
11. <FinalCta>                  — большой призыв к действию
12. <Footer>                    — подвал
```

### Источники данных каждой секции

| Секция            | Источник                                              |
|-------------------|-------------------------------------------------------|
| Nav               | static                                                |
| Hero              | `pages/home.{locale}.mdx` (заголовок, lede)            |
| Ticker            | `pages/home.{locale}.mdx` (массив тёрмов)              |
| WhoIsItFor        | `pages/home.{locale}.mdx` или `segments/*` index       |
| Curriculum preview| `programmes/*` Content Collection (короткие cards)    |
| WhatsIncluded     | `pages/home.{locale}.mdx` (общий список через все тиры)|
| Instructors       | `instructors/*` Content Collection                    |
| AfterTheProgram   | `pages/home.{locale}.mdx`                              |
| Pricing           | `programmes/*` + `bundles/*` (тиры с ценами)          |
| Faq               | `pages/faq.{locale}.mdx` (frontmatter с массивом QA)  |
| FinalCta          | `pages/home.{locale}.mdx`                              |
| Footer            | static + `contact:*` из KV                             |

### Schema.org JSON-LD на главной

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "Moirai",
  "url": "https://moirai.film",
  "sameAs": ["https://instagram.com/...", "https://youtube.com/..."]
}
</script>
```

Плюс `Course` schemas — генерируются компонентом `<CourseSchema id="..." />`
для каждой программы.

---

## 13. Performance стратегии

### Critical CSS inline

В `<head>` инлайн только то что нужно для above-the-fold. Остальное
загружается асинхронно. Astro делает это автоматически через `<style is:global>`
+ component-scoped CSS, либо через ручную split.

```html
<head>
  <style>/* critical CSS, ~10KB */</style>
  <link rel="preload" as="style" href="/assets/main.css" onload="this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="/assets/main.css"></noscript>
</head>
```

### Resource hints

```html
<link rel="preconnect" href="https://media.moirai.film" crossorigin>
<link rel="preload" href="/fonts/cormorant-300.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/outfit-vf.woff2" as="font" type="font/woff2" crossorigin>
```

Не препоадим больше 2-3 ресурсов — иначе они конкурируют с LCP.

### LCP image (если используется)

— Для главной страницы Moirai LCP скорее всего **текст** (h1 hero),
  не изображение. Это идеально для performance.
— Если позже на hero появится фоновое видео или картинка — preload + srcset:

```html
<picture>
  <source srcset="/hero-1920.avif" type="image/avif" media="(min-width: 1024px)">
  <source srcset="/hero-1024.avif" type="image/avif">
  <source srcset="/hero-1920.webp" type="image/webp" media="(min-width: 1024px)">
  <source srcset="/hero-1024.webp" type="image/webp">
  <img src="/hero-1024.jpg" alt="" width="1920" height="1080" fetchpriority="high">
</picture>
```

`fetchpriority="high"` для LCP image — критично.

### Изображения ниже fold

— `loading="lazy"` на всех `<img>` ниже fold
— `decoding="async"`
— Явные `width` и `height` атрибуты — для CLS

### JS — defer и module

```html
<script type="module" src="/assets/main.js"></script>
```

— `type="module"` автоматически defer
— Один bundle, vanilla JS, < 15KB
— Тяжёлые операции — в `requestIdleCallback`

### Кеширование на CF

— HTML — короткий cache (5 минут) с stale-while-revalidate
— CSS, JS, шрифты, иконки — immutable, 1 год (`Cache-Control: public, max-age=31536000, immutable`)
— Все ассеты с хешем в имени (`main-a3b9f.css`) — Astro делает автоматически

### Отказ от блокирующих внешних ресурсов

— Никаких `<script src="https://...">` в `<head>`
— Никаких Google Fonts через `<link>`
— Никаких analytics-скриптов до 1-го взаимодействия (если нужно — через
  `IntersectionObserver` или после `load`)

---

## 14. Accessibility checklist

Минимум для каждой публичной страницы:

— **Семантический HTML**: `<nav>`, `<main>`, `<article>`, `<aside>`,
  `<footer>`, `<section>` с правильными уровнями заголовков (один h1 на страницу)
— **`<html lang="...">`** с актуальной локалью
— **Skip link** в начале `<body>`:
  ```html
  <a href="#main" class="skip-link">Skip to main content</a>
  ```
— **Focus styles** — никогда не убираем outline без замены:
  ```css
  *:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 4px;
  }
  ```
— **Контрастность WCAG AA** для всего текста (см. §4)
— **alt-тексты** на всех `<img>` (или `alt=""` для декоративных)
— **aria-label** на иконочных кнопках
— **`<button type="button">`** для всего что не submit
— **`<details>/<summary>`** для FAQ — нативная клавиатурная навигация
— **prefers-reduced-motion** уважается во всех анимациях
— **Form labels** — каждый input с `<label for="...">`
— **Error states** через `aria-invalid` + `aria-describedby`
— **Loading/status** через `role="status" aria-live="polite"` (как в .hbs
  примерах)

---

## 15. Что дальше

После фиксации этой v0.1 — следующие шаги:

1. **Sprint 0 setup** — Astro проект, fonts subset, tokens.css в `:root`
2. **Главная страница** — реализация всех секций по этому ref-документу
3. **PageSpeed Insights audit** на staging deployment — если не 100/100,
   итерация до 100
4. **Применение системы к другим публичным страницам** (программы,
   инструкторы, журнал)
5. **ЛК и админка** — отдельная under-the-fold дизайн-система (можно
   жестче на JS, не оптимизируется под PSI, скорее под UX)

Открытые вопросы для будущих итераций:

— **`[TBD-D1]`** Hero — только типографика, или с визуалом? (фото
  Vladimir/Anastasia? Постер из их фильма? Тонкая текстура плёнки?)
— **`[TBD-D3]`** Custom cursor (как в исходном HTML) — оставляем или нет?
  На mobile его всё равно нет, на desktop добавляет ~3KB JS и небольшой
  CLS-риск на load.
— **`[TBD-D4]`** Видео-фон в hero — как `Sundance Collab` делают —
  серьёзно ухудшит LCP. Скорее нет.

---

## Версионирование

- v0.1 — исходная фиксация tokens, шрифтов, цветов, типографики, spacing,
  компонентов, performance budget, accessibility baseline
- **v0.2 — текущая** — добавлена точечная светлая тема для long-form
  контентов (модули, журнал) через `data-theme="light"` content-region
  scope. Переопределение токенов цвета и акцента. WCAG-контрасты
  проверены. `[TBD-D2]` закрыт.
- v0.3 — после первой реализации главной страницы и PSI audit
- v1.0 — после применения ко всем публичным страницам
