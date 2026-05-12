# Sprint 0 Stage 5 — Self-hosted woff2 fonts (Cormorant + Manrope VF)

## Context

После Stage 4 главная визуально готова, но рендерится **fallback**-шрифтами
(Georgia → serif для display, system-ui → sans-serif для body). Дефекты:

1. **Display-шрифт неправильный.** Дизайн рассчитан на Cormorant Garamond
   Light (300) + italic — Georgia не передаёт характер.
2. **Возможный CLS при загрузке.** Без `size-adjust` fallback'ов swap
   будет двигать layout когда финальный шрифт загрузится.

**Замена Outfit → Manrope (2026-05-12).** Изначальный план использовал
Outfit как body, но при попытке self-host выяснилось — Outfit
**не содержит Cyrillic glyph'ов**. Для bilingual проекта блокер.
Решение: Manrope Variable (близкий geometric sans, полная Cyrillic
поддержка, OFL). См. запись в `decisions_archive.md` 2026-05-12 +
`Design_system.md` §3.

## Готовые ресурсы (уже в репо после 2026-05-12 download)

```
public/fonts/
├── LICENSE.md                            # OFL для Cormorant + Manrope
├── cormorant-300.woff2          (60 KB)  # Latin+Latin-Ext+Cyrillic совмещён
├── cormorant-300-italic.woff2   (61 KB)  # Latin+Latin-Ext+Cyrillic совмещён
├── manrope-vf-latin.woff2       (25 KB)  # subset-split по Google Fonts pattern
├── manrope-vf-latin-ext.woff2   (15 KB)
├── manrope-vf-cyrillic.woff2    (14 KB)
└── manrope-vf-cyrillic-ext.woff2 (2.5 KB)
```

Cormorant — combined-subsets через google-webfonts-helper.
Manrope — subset-split через Fontsource CDN (`@fontsource-variable/manrope`).

## Принципы

1. **woff2-only.** Astro 5 — modern browsers; caniuse 98%+.
2. **`font-display: swap`.** Показываем fallback сразу, переключаем когда
   шрифт загрузится. Без FOIT.
3. **`unicode-range` для Manrope.** Browser загружает только relevant
   subsets per page (EN → latin+latin-ext ≈ 40KB; RU → +cyrillic
   ≈ 54KB; cyrillic-ext подгружается только если встретится).
4. **`size-adjust` fallback fonts** для устранения CLS при swap.
5. **`<link rel="preload">`** только для critical файлов:
   - `cormorant-300.woff2` — LCP элемент (hero `<h1>`)
   - `manrope-vf-latin.woff2` — body на всех страницах

## Этапы

### 5a — `src/styles/fonts.css`

Новый файл `src/styles/fonts.css`:

```css
/* ------------------------------------------------------------
 * Cormorant Garamond Light 300 — display headings
 * Single file content includes Latin + Latin Extended + Cyrillic
 * (from google-webfonts-helper combined subsets).
 * ------------------------------------------------------------ */
@font-face {
  font-family: "Cormorant Garamond";
  src: url("/fonts/cormorant-300.woff2") format("woff2");
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Cormorant Garamond";
  src: url("/fonts/cormorant-300-italic.woff2") format("woff2");
  font-weight: 300;
  font-style: italic;
  font-display: swap;
}

/* ------------------------------------------------------------
 * Manrope Variable — body text
 * Subset-split по Google Fonts convention. Browser скачает
 * только релевантные файлы исходя из реально встреченных
 * glyph'ов на конкретной странице.
 * ------------------------------------------------------------ */
@font-face {
  font-family: "Manrope";
  src: url("/fonts/manrope-vf-latin.woff2") format("woff2-variations");
  font-weight: 200 800;
  font-style: normal;
  font-display: swap;
  unicode-range:
    U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
    U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
    U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: "Manrope";
  src: url("/fonts/manrope-vf-latin-ext.woff2") format("woff2-variations");
  font-weight: 200 800;
  font-style: normal;
  font-display: swap;
  unicode-range:
    U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF,
    U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF,
    U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@font-face {
  font-family: "Manrope";
  src: url("/fonts/manrope-vf-cyrillic.woff2") format("woff2-variations");
  font-weight: 200 800;
  font-style: normal;
  font-display: swap;
  unicode-range:
    U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}

@font-face {
  font-family: "Manrope";
  src: url("/fonts/manrope-vf-cyrillic-ext.woff2") format("woff2-variations");
  font-weight: 200 800;
  font-style: normal;
  font-display: swap;
  unicode-range:
    U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F,
    U+FE2E-FE2F;
}
```

(Unicode-ranges — копия из Google Fonts CSS для соответствующих subsets;
проверенные значения.)

### 5b — size-adjust fallback fonts

В `fonts.css` добавить `@font-face` для fallback с подобранными метриками
(устраняют CLS при swap):

```css
/* ------------------------------------------------------------
 * Fallback fonts — выровнены по метрикам через size-adjust
 * для нулевого CLS при swap'е. Значения подбираются один раз
 * через `npx fontaine` или Font Style Matcher на реальном hero.
 * Текущие значения — стартовая аппроксимация; точная калибровка
 * — внутри этапа после визуального теста.
 * ------------------------------------------------------------ */
@font-face {
  font-family: "Cormorant Fallback";
  src: local("Georgia");
  size-adjust: 110%;       /* подобрать */
  ascent-override: 92%;
  descent-override: 23%;
  line-gap-override: 0%;
}

@font-face {
  font-family: "Manrope Fallback";
  src: local("Arial");
  size-adjust: 103%;       /* подобрать */
  ascent-override: 98%;
  descent-override: 21%;
  line-gap-override: 0%;
}
```

`tokens.css` уже содержит `--font-display: "Cormorant Garamond",
"Cormorant Fallback", Georgia, serif;` и `--font-body: "Manrope",
"Manrope Fallback", system-ui, sans-serif;` — fallback имена будут
match'иться с этими @font-face.

### 5c — импорт в Layout

`src/layouts/public/Layout.astro` — добавить импорт **после** tokens.css,
**до** base.css:

```ts
import "../../styles/tokens.css";
import "../../styles/fonts.css";    // ← новое
import "../../styles/themes.css";   // Stage 10 (если уже сделан)
import "../../styles/base.css";
import "../../styles/utilities.css";
```

### 5d — preload critical fonts в head

`src/components/public/SeoHead.astro` — добавить два preload:

```astro
<link rel="preload" href="/fonts/cormorant-300.woff2"
      as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/manrope-vf-latin.woff2"
      as="font" type="font/woff2" crossorigin>
```

`crossorigin` обязателен даже для same-origin, иначе preload не
match'ится с `@font-face` запросом и грузится дважды.

Cyrillic Manrope **НЕ** preload'ится — браузер загрузит его lazy,
когда встретит cyrillic glyph (на `/ru/` страницах после первого
скан DOM'а). Это нормально, не блокирует LCP который — латинский
title в Cormorant.

### 5e — кэш заголовки

CF Pages дефолт для статики из `/public/` — `Cache-Control: public,
max-age=14400` (4 часа). Для шрифтов (immutable URL) хотим длинный
кэш. Это решается в `public/_headers` (см. Stage 8f):

```
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

В рамках Stage 5 можно либо добавить этот блок сейчас, либо
оставить на Stage 8. Решение: **сейчас** — это 3 строки, дешевле
не оставлять long-cache на потом.

### 5f — verification

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
# открыть localhost:8788
```

Проверки в DevTools:

- **Network → font:** на `/en/` грузятся ровно `cormorant-300.woff2`
  + `manrope-vf-latin.woff2` + (после первого `<em>` на экране)
  `cormorant-300-italic.woff2`. **НЕ** грузится `manrope-vf-cyrillic.woff2`
  (нет cyrillic glyph'ов).
- **Network → font:** на `/ru/` дополнительно грузится
  `manrope-vf-cyrillic.woff2`. `manrope-vf-cyrillic-ext.woff2` —
  только если встретятся редкие cyrillic-ext glyph'и (обычно нет).
- **Cache-Control headers** на `/fonts/*.woff2` — `max-age=31536000,
  immutable`.
- **Lighthouse audit:** нет варнинга "Avoid invisible text during
  webfont load".
- **CLS = 0** при первой загрузке (Performance tab, Slow 3G).
- Hero `<h1>` визуально не "прыгает" при swap'e с Georgia → Cormorant.

После deploy → smoke на проде:
```bash
curl -sI https://moiraionline.pro/fonts/cormorant-300.woff2 | head -5
# → HTTP/2 200, content-type: font/woff2, cache-control: public,max-age=31536000,immutable
```

## Verification

После всех этапов:
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные
- [ ] `dist/fonts/` содержит 6 woff2 + LICENSE.md
- [ ] `dist/_astro/[hash].css` содержит 4 @font-face Manrope +
      2 @font-face Cormorant + 2 fallback @font-face
- [ ] `curl -I https://moiraionline.pro/fonts/cormorant-300.woff2 |
      grep -i cache-control` показывает immutable + 1 year
- [ ] PSI на проде показывает 0 layout-shift от шрифтов

## Out of scope

- **Variable Cormorant** — open-source VF Cormorant не существует;
  static 300 + 300-italic единственный путь.
- **Сабсеттинг кастомный** (только nashe latin+cyrillic minimum) —
  Google Fonts сабсеты уже узкие, размеры приемлемые.
- **Greek / Vietnamese subsets** Manrope — игнорируем, не
  используются.
- **Дополнительные веса** Manrope (400/500/700 static) — VF
  включает все, ничего дополнительно грузить не надо.
- **Font-loading API** (`document.fonts.ready`) — не нужно при
  правильных `font-display: swap` + `size-adjust` метриках.

## Critical files

- `public/fonts/*.woff2` (уже скачаны 2026-05-12, 6 файлов)
- `public/fonts/LICENSE.md` (уже создан)
- `src/styles/fonts.css` (новый)
- `src/styles/tokens.css` (`--font-body` обновлён на Manrope)
- `src/layouts/public/Layout.astro` (import fonts.css)
- `src/components/public/SeoHead.astro` (preload links)
- `public/_headers` (cache-control для /fonts/*)

## Reference

- `docs/Design_system.md` §3 — типографика (обновлена 2026-05-12)
- `.agent/rules/decisions_archive.md` 2026-05-12 — запись про
  Outfit → Manrope замену
- web.dev/fast/#optimize-your-fonts
- developer.mozilla.org `@font-face/size-adjust`
- Google Fonts CSS — источник `unicode-range` значений для subsets
- Tools: `npx fontaine`, Monica Dinculescu Font Style Matcher
