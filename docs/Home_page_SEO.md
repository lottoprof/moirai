# Moirai — Home Page SEO v0.1

> **Status:** working draft. Зафиксированы: keyword targeting, anti-
> cannibalization, иерархия заголовков, источник данных каждой секции,
> Schema.org разметка, hreflang/canonical, internal linking strategy,
> Open Graph и Twitter Card.
>
> Применяется к URL: `/en/` и `/ru/`. Связан с DESIGN_SYSTEM.md §12
> (структура секций) и ARCHITECTURE.md §3, §4, §6.

---

## 1. Цели страницы

Главная страница Moirai — самый сильный SEO-актив в проекте (наибольший
link equity, наиболее ценный для бренда). Её задача:

1. **Захватить общий программный intent** — пользователь ищет "online
   filmmaking program / school / course", главная отвечает: вот мы.
2. **Конвертировать в Apply / на детальную страницу программы** через
   чёткий CTA-каскад.
3. **Установить authority через Schema.org** — Educational Organization
   с курсами и инструкторами, видна в Knowledge Graph и AI Overviews.
4. **Распределить link equity на детальные страницы** через осмысленную
   внутреннюю перелинковку.

### Anti-cannibalization

Главная **не конкурирует** со своими внутренними страницами. Каждая
страница целится в свой кластер запросов:

| Страница                          | Primary intent                                     |
|-----------------------------------|----------------------------------------------------|
| `/{locale}/`                       | общий программный: "online filmmaking program"    |
| `/{locale}/[programme-id]`         | конкретная программа: "online directing course"   |
| `/{locale}/[bundle-id]`            | пакет: "filmmaking bundle online"                  |
| `/{locale}/instructors/[id]`      | имя инструктора: "vladimir popov director"        |
| `/{locale}/for/[segment]`          | сегмент: "filmmaking for content creators"         |
| `/{locale}/journal/[slug]`         | long-tail: "how to direct dialogue scene"          |
| `/{locale}/works`                  | "moirai student films"                             |

Главная **не повторяет** длинные описания программ дословно — даёт
короткие тизеры со ссылками на детальные страницы. Это распределяет
ranking signals и предотвращает duplicate content.

---

## 2. Keyword research

### EN — основной язык продукта

**Primary keyword (целимся реалистично):**

— `online filmmaking program` — высокая конкуренция, низкий CPC, средний
  объём. Но shape запроса (program, не school) хорошо ложится на оффер:
  у нас именно структурированная программа с датами, не каталог из 1000
  курсов как у MasterClass.

**Secondary (поддерживающие):**

- `online filmmaking course`
- `learn directing online`
- `online film school for beginners`
- `online directing program`

**Long-tail (легче ранжироваться, выше intent):**

- `online filmmaking program with personal feedback`
- `small group filmmaking course online`
- `1:1 directing mentorship online`
- `learn to direct your first short film online`
- `online filmmaking course with live sessions`
- `structured online film school program`

**Что НЕ целим на главной:**

- ❌ "best online film school" — informational, ведёт к comparison-постам
  в журнале (`/journal/online-film-schools-compared` или подобное)
- ❌ "free filmmaking course" — wrong intent, мы платный продукт
- ❌ "MasterClass alternative" — лучше отдельный пост в журнале

### RU — русскоязычная аудитория (диаспора + СНГ)

**Primary:**

— `онлайн программа кинорежиссуры` — низкая конкуренция, целевая, точно
  отражает суть оффера

**Secondary:**

- `онлайн школа кино`
- `курс кинорежиссуры онлайн`
- `обучение режиссуре онлайн`

**Long-tail:**

- `научиться снимать кино с нуля онлайн`
- `онлайн курс с обратной связью режиссёра`
- `сделать первый короткометражный фильм`
- `курс кинорежиссёра с живыми консультациями`

### Anti-keywords (явно исключаем)

— "Cinematography 101 free", "screenwriting templates" — мы не template-shop
— "filmmaking bootcamp" — у нас не бутcamp (нет 12-часовой нагрузки в день)
— "film school degree online" — мы не аккредитованы

---

## 3. URL, canonical, hreflang

### Структура URL

```
https://moirai.film/                    → 302 на /en/ или /ru/ по Accept-Language
https://moirai.film/en/                 → home en
https://moirai.film/ru/                 → home ru
```

### Canonical (на каждом локализованном home)

```html
<!-- /en/ -->
<link rel="canonical" href="https://moirai.film/en/">
<link rel="alternate" hreflang="en" href="https://moirai.film/en/">
<link rel="alternate" hreflang="ru" href="https://moirai.film/ru/">
<link rel="alternate" hreflang="x-default" href="https://moirai.film/en/">
```

```html
<!-- /ru/ -->
<link rel="canonical" href="https://moirai.film/ru/">
<link rel="alternate" hreflang="en" href="https://moirai.film/en/">
<link rel="alternate" hreflang="ru" href="https://moirai.film/ru/">
<link rel="alternate" hreflang="x-default" href="https://moirai.film/en/">
```

`x-default` указывает на `/en/` как fallback для пользователей с
неподдерживаемой Accept-Language.

### Корневой `/` без локали

— HTTP 302 редирект, не каноническая страница
— Detection через `Accept-Language` header в Worker, fallback на `en`
— **Не индексируется** — Worker возвращает `X-Robots-Tag: noindex` для `/`
  чтобы не было duplicate content с локализованными версиями

---

## 4. Title и meta description

### Pattern

Title строится из шаблона + контентного источника в Content Collections
(`pages/home.{locale}.mdx` frontmatter). Никакого хардкода в коде.

```yaml
# /src/content/pages/home.en.mdx (frontmatter)
seo:
  title: "Online Filmmaking Program — Direct Your First Film | Moirai"
  description: "Two-level online program taught by working directors. Small groups, 1:1 sessions, personal feedback. Learn directing, editing, screenwriting and finish with your own short film."
  og_image: "media/og/home.en.jpg"
```

```yaml
# /src/content/pages/home.ru.mdx (frontmatter)
seo:
  title: "Онлайн-программа кинорежиссуры — Сними свой первый фильм | Moirai"
  description: "Двухуровневая программа от практикующих режиссёров. Малые группы, 1:1 сессии, персональный фидбэк. Режиссура, монтаж, сценарий — с финальным короткометражным фильмом."
  og_image: "media/og/home.ru.jpg"
```

### Правила

— Title: 50-60 символов (обрезается в SERP). Brand в конце через `|`.
  Primary keyword в начале.
— Description: 150-160 символов. Не keyword stuffing — естественный текст
  с одним вхождением primary и парой LSI-терминов.
— На каждый язык — свой текст, написанный носителем (не машинный перевод).

### Рендер в HTML

```html
<title>{seo.title}</title>
<meta name="description" content="{seo.description}">
```

Через единый компонент `<SeoHead>` который читает frontmatter — никаких
прямых `<title>` в коде страницы.

---

## 5. Иерархия заголовков

Один `<h1>` на страницу. Каждая секция — `<h2>`. Внутри карточек/блоков —
`<h3>` или `<h4>`.

```
<h1> Direct your first film.                          [hero]
├── <h2> Film school teaches theory. We teach practice.   [who]
│   ├── <h3> Content creators going deeper
│   ├── <h3> Aspiring indie filmmakers
│   ├── <h3> Photographers moving to video
│   └── <h3> Complete beginners
│
├── <h2> Two levels. One finished film.                  [curriculum preview]
│   ├── <h3> Beginner — foundation
│   └── <h3> Intermediate — depth
│
├── <h2> Everything to finish the film.                  [whats included]
│   ├── <h3> Live sessions
│   ├── <h3> Practice after every module
│   ├── <h3> Final film review
│   └── <h3> Lifetime access to recordings
│
├── <h2> Taught by working directors.                    [instructors]
│   ├── <h3> Vladimir Popov
│   └── <h3> Anastasia Zasypkina
│
├── <h2> You leave with more than a film.                [after the program]
│
├── <h2> Simple, transparent pricing.                    [pricing]
│   ├── <h3> Beginner
│   ├── <h3> Intermediate
│   └── <h3> Bundle
│
├── <h2> Common questions.                               [faq]
│
└── <h2> Make your first film.                           [final cta]
```

### Принципы

— **H1 эмоциональный**, не SEO-нагруженный. Главное вхождение primary
  keyword делается **через eyebrow** над H1 и **через title/description**.
  Это даёт правильный баланс: SEO довольно, бренд силён.
— **H2 каждой секции — самостоятельная фраза с LSI-термином.** Не "Кто
  это?" а "Film school teaches theory. We teach practice." — фраза несёт
  смысл и в Google Snippet, и в content readable.
— **H3 — короткие, фактические.** "Vladimir Popov", "Beginner", "Live
  sessions". Без длинных вопросов.

### Source of headings

```yaml
# pages/home.en.mdx
hero:
  eyebrow: "Online Filmmaking Program · small groups · 1:1 with working directors"
  title: "Direct <em>your</em> first film."
  lede: "A two-level online program taught by working directors..."
sections:
  who:
    eyebrow: "Who is this for"
    h2: "Film school teaches theory. We teach <em>practice</em>."
  curriculum:
    eyebrow: "Curriculum"
    h2: "Two levels. One finished film."
  # ... etc
```

Никакого хардкода в `index.astro`. H2 рендерится из MDX-frontmatter,
переключается локалью.

---

## 6. Структура контента по секциям

12 секций (см. DESIGN_SYSTEM.md §12) с SEO-фокусом каждой.

### 6.1 Hero

**SEO-роль:** место главного вхождения primary keyword (через `eyebrow`),
эмоциональный hook (через H1), главный CTA.

**LCP element:** H1. Это критично для performance — текстовый LCP с
preloaded шрифтом грузится быстрее любой картинки.

```html
<section class="hero">
  <span class="hero__eyebrow eyebrow">
    Online Filmmaking Program · small groups · 1:1 with working directors
  </span>
  <h1 class="hero__title h1">
    Direct <em>your</em> first film.
  </h1>
  <p class="hero__lede text-muted">
    A two-level online program taught by working directors.
    Small groups, personal feedback, finished short film.
  </p>
  <a class="btn btn--primary btn--lg" href="/en/apply">
    Apply now
    <span class="icon" data-icon="mono/arrow-right" aria-hidden="true"></span>
  </a>
</section>
```

— Eyebrow содержит primary keyword + USP (small groups, 1:1, working
  directors)
— H1 — эмоциональный, бренд-фраза
— Lede — несёт LSI-термины (program, working directors, personal feedback,
  short film)
— CTA на `/en/apply`

### 6.2 Ticker (бегущая строка)

**SEO-роль:** semantic enrichment через тематические термины
(directing, editing, screenwriting, cinematography, framing, ...).

```html
<div class="ticker" aria-hidden="true">
  <!-- visible to humans, ignored by screen readers, but text is in DOM
       and indexed by Google -->
</div>
```

`aria-hidden="true"` означает что screen readers пропускают, но **Google
индексирует** — это полезный bonus для long-tail тематических термов.

### 6.3 Who is it for (сегменты)

**SEO-роль:** **internal linking** на сегментные страницы. Это главный
способ распределить link equity на 3 segment-лендинга.

```html
<section class="section" id="who">
  <div class="center">
    <span class="eyebrow">Who is this for</span>
    <h2 class="h2">Film school teaches theory. We teach <em>practice</em>.</h2>

    <div class="who-grid stack-2xl">
      <article class="who-card">
        <h3 class="h4">Content creators going deeper</h3>
        <p class="text-muted">You shoot YouTube or TikTok but want to tell real stories...</p>
        <a class="link link--accent" href="/en/for/content-creators">
          For content creators →
        </a>
      </article>
      <!-- + photographers, + beginners — каждая со ссылкой на свою сегментную страницу -->
    </div>
  </div>
</section>
```

— Каждая `who-card` ссылается на `/en/for/[segment]` — это **высокоценные
  internal links** для сегментных страниц
— H3 содержат LSI-термины (content creators, photographers, beginners)

### 6.4 Curriculum preview

**SEO-роль:** internal linking на programme detail pages.

```html
<section class="section" id="curriculum">
  <div class="center">
    <span class="eyebrow">Curriculum</span>
    <h2 class="h2">Two levels. One finished film.</h2>

    <div class="programme-grid">
      <article class="programme-card">
        <h3 class="h4">Beginner — foundation</h3>
        <p class="text-muted">Visual language, editing rhythm, three-act structure.
          End with your first short.</p>
        <a class="link link--accent" href="/en/beginner">
          Explore Beginner →
        </a>
      </article>
      <article class="programme-card">
        <h3 class="h4">Intermediate — depth</h3>
        <p class="text-muted">Actor direction, world-building, producing.
          End with a festival-ready short.</p>
        <a class="link link--accent" href="/en/intermediate">
          Explore Intermediate →
        </a>
      </article>
    </div>
  </div>
</section>
```

— Содержание (списки треков, темы) **не дублируется** с программными
  страницами. Здесь — только тизер.

### 6.5 What's Included

**SEO-роль:** структурированный список фич — индексируется как featured
snippet кандидат.

```html
<section class="section section--alt" id="included">
  <div class="center">
    <span class="eyebrow">What's included</span>
    <h2 class="h2">Everything to finish the film.</h2>

    <ul class="features-grid">
      <li class="feature">
        <h3 class="h5">Live sessions</h3>
        <p class="text-muted">Personal 1:1 video sessions with working
          directors after each practical module.</p>
      </li>
      <!-- + 5-7 features total -->
    </ul>
  </div>
</section>
```

— Структура `<ul>` + h3 + p — Google любит для list snippets
— Содержание из `pages/home.{locale}.mdx` через `<ProgrammeFeatures>`
  компонент или напрямую

### 6.6 Instructors

**SEO-роль:** **brand authority + Schema.org Person** + internal linking
на instructor pages.

```html
<section class="section" id="instructors">
  <div class="center">
    <span class="eyebrow">Instructors</span>
    <h2 class="h2">Taught by <em>working</em> directors.</h2>

    <div class="instructor-grid">
      <article class="instructor-card">
        <img src="..." alt="Vladimir Popov, film director and educator"
             width="320" height="320" loading="lazy" decoding="async">
        <h3 class="h4">Vladimir Popov</h3>
        <p class="text-muted">Film director and educator. Music videos,
          short films, commercial productions.</p>
        <a class="link" href="/en/instructors/vladimir-popov">
          Read more →
        </a>
      </article>
      <!-- + Anastasia -->
    </div>
  </div>
</section>
```

— alt у фотографий: имя + role + краткий контекст. Не "headshot of person".
— Размеры явные (`width`, `height`) — для CLS prevention
— `loading="lazy"` — секция ниже fold
— Схема Person (см. §7) генерируется автоматически из
  `instructors/[id].{locale}.mdx`

### 6.7 After the program

**SEO-роль:** outcome-focused content. Хорошо ранжируется на запросы вида
"what you learn in filmmaking program".

```html
<section class="section" id="after">
  <div class="center">
    <span class="eyebrow">After the program</span>
    <h2 class="h2">You leave with <em>more</em> than a film.</h2>

    <div class="outcomes-grid">
      <div class="outcome">
        <h3 class="h5">A festival submission</h3>
        <p class="text-muted">Personal guidance on which festivals to target...</p>
      </div>
      <!-- ... -->
    </div>
  </div>
</section>
```

### 6.8 Pricing

**SEO-роль:** видимые цены = **Schema.org Offer** + competitive
transparency. Многие пользователи специально ищут "online filmmaking
program price".

```html
<section class="section" id="pricing">
  <div class="center">
    <span class="eyebrow">Pricing</span>
    <h2 class="h2">Simple, transparent pricing.</h2>

    <div class="pricing-grid">
      <!-- Через компонент <TierCard programme="beginner" tier="standard" /> -->
      <!-- Цены из Content Collection programmes/beginner.*.mdx tiers[] -->
    </div>
  </div>
</section>
```

— Конкретные цены в DOM (не только через JS) — Google индексирует
— Schema.org Offer на каждом тире (см. §7)
— Никакого хардкода — всё через `<TierCard>` компонент из data

### 6.9 FAQ

**SEO-роль:** **Schema.org FAQPage** — попадание в Google Rich Results.

```html
<section class="section" id="faq">
  <div class="center">
    <span class="eyebrow">Common questions</span>
    <h2 class="h2">Common questions.</h2>

    <div class="faq stack-md">
      <details class="faq__item">
        <summary class="faq__question">
          Is this fully online? What time are sessions held?
        </summary>
        <div class="faq__answer text-muted">
          <p>Yes, fully online via Zoom. All sessions are scheduled
            in Eastern Time (ET). If you're in a different timezone,
            all sessions are recorded.</p>
        </div>
      </details>
      <!-- 6-8 вопросов -->
    </div>
  </div>
</section>
```

— Native `<details>/<summary>` индексируется Google
— Schema.org FAQPage генерируется из этого же data-источника

### 6.10 Final CTA

**SEO-роль:** второй H1-уровневый momentum + дополнительный link на Apply.

```html
<section class="section section--cta" id="final-cta">
  <div class="center">
    <span class="eyebrow">Ready?</span>
    <h2 class="h2 h2--display">Make your <em>first</em> film.</h2>
    <p class="text-muted">Applications reviewed within 48 hours.</p>
    <a class="btn btn--primary btn--xl" href="/en/apply">
      Apply now
    </a>
  </div>
</section>
```

### 6.11 Footer

**SEO-роль:** universal navigation, NAP (name/address/phone если есть),
sitemap-ish links.

```html
<footer class="footer">
  <div class="center">
    <nav class="footer-nav" aria-label="Footer">
      <a href="/en/beginner">Beginner</a>
      <a href="/en/intermediate">Intermediate</a>
      <a href="/en/works">Student films</a>
      <a href="/en/journal">Journal</a>
      <a href="/en/faq">FAQ</a>
      <a href="/en/contact">Contact</a>
      <a href="/en/legal/privacy">Privacy</a>
      <a href="/en/legal/terms">Terms</a>
    </nav>
    <p class="text-faint">© 2026 Moirai</p>
  </div>
</footer>
```

— Перелинковка на все ключевые страницы
— Aria-label для footer nav

---

## 7. Schema.org JSON-LD

Все блоки генерируются компонентами из data-источников, не пишутся
руками. Это часть anti-hardcode правил.

### 7.1 EducationalOrganization (главный block, на каждой home page)

```json
{
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "@id": "https://moirai.film/#organization",
  "name": "Moirai",
  "url": "https://moirai.film/{locale}/",
  "logo": "https://media.moirai.film/branding/logo.png",
  "description": "Online filmmaking program teaching directing, editing, and screenwriting through small-group sessions and personal mentorship.",
  "sameAs": [
    "https://instagram.com/moirai.film",
    "https://youtube.com/@moirai-film"
  ],
  "founder": [
    { "@type": "Person", "name": "Vladimir Popov", "url": "https://moirai.film/en/instructors/vladimir-popov" },
    { "@type": "Person", "name": "Anastasia Zasypkina", "url": "https://moirai.film/en/instructors/anastasia-zasypkina" }
  ]
}
```

Источники: `pages/home.{locale}.mdx` (description), `instructors/*.mdx`
(founders), KV (`contact:social.*`).

### 7.2 Course (по одной на каждую программу)

Через компонент `<CourseSchema id="beginner" />`:

```json
{
  "@context": "https://schema.org",
  "@type": "Course",
  "@id": "https://moirai.film/en/beginner#course",
  "name": "Beginner — Foundation in Filmmaking",
  "description": "12-week structured program covering visual language, editing fundamentals, three-act structure, and ending with your first short film.",
  "provider": {
    "@id": "https://moirai.film/#organization"
  },
  "url": "https://moirai.film/en/beginner",
  "inLanguage": "en",
  "educationalLevel": "Beginner",
  "hasCourseInstance": [
    {
      "@type": "CourseInstance",
      "courseMode": "online",
      "startDate": "2026-03-15",
      "endDate": "2026-06-07",
      "location": { "@type": "VirtualLocation", "url": "https://moirai.film/en/runs/beg-2026-03-en" },
      "instructor": [
        { "@type": "Person", "@id": "https://moirai.film/en/instructors/vladimir-popov#person" }
      ]
    }
  ],
  "offers": [
    {
      "@type": "Offer",
      "name": "Standard tier",
      "price": "369",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": "https://moirai.film/en/beginner#standard"
    }
  ]
}
```

— `hasCourseInstance` генерируется из ближайшего `runs WHERE status='open'`
  для этой programme
— `offers` — массив тиров из `programmes/[id].mdx`
— На главной показываются короткие Course schemas; полные — на программных
  страницах

### 7.3 Person (по одной на каждого инструктора, видимого на главной)

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://moirai.film/en/instructors/vladimir-popov#person",
  "name": "Vladimir Popov",
  "jobTitle": "Film Director and Educator",
  "url": "https://moirai.film/en/instructors/vladimir-popov",
  "image": "https://media.moirai.film/instructors/vladimir-popov/photo.jpg",
  "worksFor": { "@id": "https://moirai.film/#organization" },
  "knowsAbout": ["Film Directing", "Cinematography", "Music Video Production"],
  "alumniOf": "..."
}
```

### 7.4 FAQPage (если на главной есть FAQ секция)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is this fully online?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, fully online via Zoom. All sessions are scheduled..."
      }
    }
  ]
}
```

### 7.5 BreadcrumbList — НЕ нужен на главной

Главная — корень, breadcrumb на ней не имеет смысла. На внутренних
страницах добавляется отдельно.

### Размещение JSON-LD

Все блоки — в `<head>` или непосредственно перед `</body>`. Один общий
компонент `<HomeSchemas locale="en" />` генерирует все 4 блока:

```html
<script type="application/ld+json">{ EducationalOrganization }</script>
<script type="application/ld+json">{ Course beginner }</script>
<script type="application/ld+json">{ Course intermediate }</script>
<script type="application/ld+json">{ Person vladimir }</script>
<script type="application/ld+json">{ Person anastasia }</script>
<script type="application/ld+json">{ FAQPage }</script>
```

Можно объединить через `@graph`, но Google рекомендует отдельные блоки —
проще для парсинга.

---

## 8. Open Graph и Twitter Card

### Open Graph

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="Moirai">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ru_RU">
<meta property="og:url" content="https://moirai.film/en/">
<meta property="og:title" content="Online Filmmaking Program — Direct Your First Film">
<meta property="og:description" content="Two-level online program taught by working directors. Small groups, 1:1 sessions, personal feedback.">
<meta property="og:image" content="https://media.moirai.film/og/home.en.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Moirai online filmmaking program">
```

### Twitter Card

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@moirai_film">
<meta name="twitter:title" content="Online Filmmaking Program — Direct Your First Film">
<meta name="twitter:description" content="Two-level online program with working directors. 1:1 mentorship.">
<meta name="twitter:image" content="https://media.moirai.film/og/home.en.jpg">
```

### OG image strategy

— **Размер 1200×630**, под социальными платформами и Slack/Discord
  preview-блоками
— **Формат JPEG** (не WebP — не все парсеры поддерживают), размер < 200KB
— **Содержание**: заголовок (Cormorant Garamond) на тёмном фоне с амбер-
  акцентом + лого Moirai. Без UI-элементов, без скриншотов сайта.
— **На каждой локали свой** (`og/home.en.jpg`, `og/home.ru.jpg`) — текст
  должен быть переведён
— Хранится в R2 публично (`media.moirai.film/og/`), кешируется на edge

---

## 9. Internal linking strategy

Главная — главный распределитель link equity. Перелинковка выстроена так:

```
Home (max equity)
├─→ /beginner            (программа)
├─→ /intermediate        (программа)
├─→ /[bundle-id]         (bundle, если есть)
├─→ /for/content-creators (segment)
├─→ /for/photographers   (segment)
├─→ /for/beginners       (segment)
├─→ /instructors/vladimir-popov
├─→ /instructors/anastasia-zasypkina
├─→ /works               (галерея)
├─→ /journal             (блог-индекс — НЕ конкретные посты)
├─→ /faq                 (через footer + Schema)
├─→ /apply               (× 3-4 раза с разных секций — это OK)
└─→ /runs                (через CTA в pricing — "see open runs")
```

### Anchor text стратегия

— **Естественный**, не keyword-stuffed:
  - ❌ "Best online directing course" → /beginner
  - ✅ "Explore Beginner" / "Read about Beginner" / "See programme details"
— **Разнообразие** anchor: на одну страницу с разных секций ведём с
  разными словами
— **Не повторяем дословно** название страницы как anchor больше 1-2 раз

### Что НЕ линкуем с главной

- ❌ `/contact` — внутреннее, не важное для SEO. Только в footer.
- ❌ `/legal/*` — только в footer
- ❌ Конкретные посты journal — индекс блога, посты получают equity через
  индекс
- ❌ Старые archived runs — только активные

---

## 10. Изображения и alt-стратегия

### LCP — text, не изображение

Главное преимущество эстетики Moirai (большой типографический hero) — **LCP
это `<h1>`, не картинка**. Это идеально для performance.

— Никакого hero-изображения above the fold
— Если будет фоновая текстура — `<div class="hero-texture" aria-hidden="true">`
  с CSS background, не блокирует render

### Изображения в секциях ниже fold

| Где                           | Что                                            | Размер источника | Формат     |
|-------------------------------|------------------------------------------------|------------------|------------|
| Instructors                   | портреты Vladimir, Anastasia                  | 800×800          | AVIF + JPEG fallback |
| Works (если на главной)       | thumbnail-постеры студенческих работ          | 600×800          | AVIF + JPEG |
| Programme cards (если фото)   | образ программы                                | 600×400          | AVIF + JPEG |

### Шаблон `<picture>`

```html
<picture>
  <source srcset="/instructors/vladimir-320.avif 1x, /instructors/vladimir-640.avif 2x" type="image/avif">
  <source srcset="/instructors/vladimir-320.webp 1x, /instructors/vladimir-640.webp 2x" type="image/webp">
  <img
    src="/instructors/vladimir-320.jpg"
    srcset="/instructors/vladimir-640.jpg 2x"
    alt="Vladimir Popov, film director and educator"
    width="320"
    height="320"
    loading="lazy"
    decoding="async"
  >
</picture>
```

### Alt-текст правила

- **Информативный, не описательный**: "Vladimir Popov, film director and
  educator" вместо "Headshot of a man in a black shirt"
- **Без keyword stuffing**: один primary keyword максимум
- **Декоративные изображения**: `alt=""` (пустой, не пропускать атрибут)

---

## 11. Performance ↔ SEO синергия

Многие SEO-факторы напрямую выводятся из performance.

### LCP как ranking factor

— LCP < 2.5s — Google считает "good page experience". Цель Moirai — < 1.8s.
— LCP element = `<h1>` с preloaded шрифтом. Никаких блокирующих ресурсов
  выше H1 в HTML.

### CLS prevention

— Шрифты с `size-adjust` fallback (см. DESIGN_SYSTEM.md §3) предотвращают
  layout shift при font swap
— Все `<img>` имеют `width` и `height` атрибуты
— Никаких dynamically inserted элементов выше fold

### INP / interactivity

— `<details>/<summary>` для FAQ — нативный, INP нулевой
— Нет JS-фреймворков на главной — нет hydration cost
— Modal Apply form (если есть) — гидрируется только при клике на CTA, не
  на load

### Mobile-first indexing

Google использует mobile rendering для ranking. Все breakpoints, шрифты,
spacing рассчитаны mobile-first. Hero на 360px viewport должен быть
читаемым и LCP < 1.8s.

---

## 12. Sitemap, robots, indexing

### robots.txt

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /dashboard/
Disallow: /drafts/

Sitemap: https://moirai.film/sitemap-index.xml
```

### Sitemap

Один `sitemap-index.xml` со ссылками на:
— `sitemap-pages.xml` — публичные статичные страницы (home, programmes,
  instructors, segments, faq, contact, legal)
— `sitemap-runs.xml` — открытые runs (динамика из D1)
— `sitemap-journal.xml` — посты блога

Все URL в обеих локалях с `<xhtml:link rel="alternate" hreflang="...">`.

### Главная индексируется

— `/en/` и `/ru/` — `index, follow`
— `/` — `noindex, follow` (редирект, не отдельная страница)

```html
<meta name="robots" content="index, follow, max-image-preview:large">
```

`max-image-preview:large` — для лучшего отображения OG-картинки в SERP.

---

## 13. Content рекомендации (для копирайтера)

### Tone of voice

— **Concrete, не abstract**: "Direct your first film" не "Discover your
  creative journey"
— **No fluff**: убираем "embark on", "unleash", "level up", "journey"
- **Authority через specificity**: "12 sessions across 3 tracks" сильнее
  "comprehensive curriculum" (но числа берутся из data — см. правило)
— **Прямая речь второго лица**: "You'll learn", не "Students will learn"

### Примеры запрещённых формулировок (для voice-guide.md)

- ❌ "Embark on your filmmaking journey"
- ❌ "Unleash your creative potential"
- ❌ "Level up your filmmaking skills"
- ❌ "Discover the magic of cinema"
- ❌ "Take your storytelling to the next level"
- ❌ "Comprehensive, all-inclusive program"

### Длина основных текстов

— Hero lede: 15-25 слов
— Section H2: 4-8 слов
— Section paragraph: 30-60 слов
— Card description: 15-30 слов

Длинные описания — на детальных страницах.

---

## 14. Чеклист перед запуском

Прежде чем запустить главную в продакшен:

### Технические

- [ ] LCP < 1.8s на mobile (PageSpeed Insights, throttled 3G)
- [ ] CLS < 0.05
- [ ] INP < 100ms
- [ ] Все шрифты subset+woff2, Cormorant 300 preloaded
- [ ] Critical CSS inline, async для остального
- [ ] Все изображения AVIF+JPEG fallback с явными размерами
- [ ] HTTP/2, Brotli (CF делает автоматически)
- [ ] Service worker — нет в MVP (опционально позже)

### SEO

- [ ] Уникальный title с primary keyword в начале, brand в конце
- [ ] Description 150-160 chars, естественный текст
- [ ] H1 — один на страницу
- [ ] Hierarchy h1 → h2 → h3 без skip-уровней
- [ ] hreflang en/ru/x-default на каждой локали
- [ ] Canonical на каждой локали
- [ ] Schema.org: EducationalOrganization, Course×N, Person×N, FAQPage
- [ ] OG: title, description, image 1200×630, locale
- [ ] Twitter Card: summary_large_image
- [ ] Все изображения с осмысленным alt
- [ ] robots.txt + sitemap-index.xml
- [ ] Internal linking на все ключевые страницы

### Анти-хардкод

- [ ] Все цены из Content Collections programmes/bundles tiers
- [ ] Все числа модулей/недель — через `<Fact>` компонент
- [ ] Schema.org через компоненты `<CourseSchema>`, `<PersonSchema>`,
  `<OrganizationSchema>`
- [ ] Никаких `$\d+` в HTML вне Content Collections

### Содержание

- [ ] Все тексты прошли voice-guide review (нет fluff формулировок)
- [ ] EN и RU версии — переведены носителями (не машинный перевод)
- [ ] Все CTA ведут на `/apply`, `/runs`, или `/dashboard`

---

## 15. Что дальше

После реализации главной:

1. **Live deployment + PageSpeed Insights audit** — итерация до 100/100
2. **Google Search Console** — submit sitemap, monitor coverage и Core
   Web Vitals
3. **Search Console performance** через 30-60 дней — какие запросы реально
   ранжируются, корректировка targeting
4. **Применение SEO-системы к программным страницам** (`[programme-id]`,
   `[bundle-id]`) — они работают по похожему шаблону, но с keywords
   следующего уровня
5. **Запуск journal pipeline** — long-tail контент через agent-driven
   workflow

### Открытые вопросы

— **`[TBD-S1]`** Hreflang strategy для diaspora-RU аудитории — `ru` или
  `ru-RU`/`ru-US`? Если основная аудитория диаспора в США, имеет смысл
  `ru-US` чтобы Google показывал в US SERP, не только Yandex.
— **`[TBD-S2]`** OG-image — статика (один на локаль) или dynamic с
  актуальной ценой/датой ближайшего run? Dynamic через CF Workers
  (rendering OG images) — мощно, но сложнее. Стартуем со static.
— **`[TBD-S3]`** Aggregate ratings — когда появятся отзывы выпускников,
  добавить `AggregateRating` к Course schema. Нужна страница `/reviews`
  или встроить в программные.

---

## Версионирование

- **v0.1 — текущая** — keyword targeting (en+ru), anti-cannibalization,
  иерархия H1-H3, источники данных, Schema.org JSON-LD блоки, OG/Twitter,
  hreflang/canonical, internal linking, alt-strategy, performance↔SEO
  синергия, robots/sitemap, content рекомендации, pre-launch checklist
- v0.2 — после реализации и PSI/SC audit
- v1.0 — после первых ranking данных через 60 дней
