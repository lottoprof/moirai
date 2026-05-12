# Sprint 0 Stage 5 — Self-hosted woff2 fonts + size-adjust fallbacks

## Context

Stage 4 закрыт: главная стилизованно отдаётся с **fallback chain**
`Cormorant Garamond → Cormorant Fallback → Georgia → serif` и
`Outfit → Outfit Fallback → system-ui → sans-serif` (см. `tokens.css`
строки 15-16). Реальные шрифтовые файлы отсутствуют, поэтому
рендерится Georgia / system-ui.

Цель Stage 5 — поднять реальные Cormorant Garamond Light (300) +
italic и Outfit Variable, self-hosted на нашем домене, **без CLS** при
swap'е с fallback на финальный шрифт. Это даст:

1. Финальный вид типографики на бренд-уровне (display-serif для
   заголовков, sans для тела).
2. Web Vitals на зелёное: LCP элемент = `<h1>` текстовый, swap без
   layout shift, preload критичных файлов.

## Prerequisites (от пользователя)

Положить файлы в `public/fonts/`:

- `cormorant-300.woff2` — Cormorant Garamond Light (weight 300),
  Latin + Cyrillic subset (ru+en заголовки)
- `cormorant-300-italic.woff2` — Cormorant Garamond Light Italic
  (для `<em>` акцентов: "your", "practice", "more", "first")
- `outfit-vf.woff2` — Outfit Variable Font, weight range 100-900
  (body / UI текст)

Источник: Google Fonts (оба семейства open-source) → конвертация в
woff2 + subset через `pyftsubset` / `fonttools` под Latin Extended +
Cyrillic диапазоны.

Лицензии — SIL Open Font License v1.1; копию положить в
`public/fonts/LICENSE.txt`.

## Принципы

1. **woff2-only.** Astro 5 ориентирован на современные браузеры; woff
   и ttf не нужны (caniuse.com/woff2 — 98%+ глобально).
2. **`font-display: swap`.** Показываем fallback сразу, переключаемся
   на финальный шрифт когда он подгрузится. Без FOIT.
3. **`size-adjust` + `ascent-override` + `descent-override`** в
   `@font-face` для fallback fonts — выровнять метрики чтобы swap не
   двигал layout (CLS = 0).
4. **`<link rel="preload">`** только для critical файлов (cormorant-300
   на hero h1 + outfit-vf для body). Не пере-загружать всё.
5. **`unicode-range`** subset declarations — браузер не качает
   кириллический файл если страница чисто латинская и наоборот.
   Если subset один (Latin+Cyrillic объединены) — этот шаг не нужен.

## Этапы

### 5a — files в public/fonts/

- Пользователь кладёт три файла woff2 + LICENSE.txt.
- Агент проверяет:
  - размеры в разумных пределах (cormorant ~30-60KB на subset,
    outfit-vf ~50-100KB);
  - `file public/fonts/*.woff2` отдаёт правильный magic
    (`Web Open Font Format 2`).
- Никаких изменений в коде.

### 5b — src/styles/fonts.css

Новый файл `src/styles/fonts.css` с `@font-face` для трёх семейств:

```css
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

@font-face {
  font-family: "Outfit";
  src: url("/fonts/outfit-vf.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
```

### 5c — size-adjust fallback `@font-face`

В тот же `fonts.css` — fallback fonts с подобранными метриками.
Метрики достаются один раз через **Font Style Matcher** (Monica
Dinculescu tool) или CLI `npx fontaine` / `npx capsizecss`. Цель —
визуально невидимый swap.

```css
@font-face {
  font-family: "Cormorant Fallback";
  src: local("Georgia");
  size-adjust: 110%;    /* placeholder — подобрать */
  ascent-override: 92%;
  descent-override: 23%;
  line-gap-override: 0%;
}

@font-face {
  font-family: "Outfit Fallback";
  src: local("Arial");
  size-adjust: 103%;    /* placeholder — подобрать */
  ascent-override: 98%;
  descent-override: 21%;
  line-gap-override: 0%;
}
```

Точные числа — после загрузки реальных woff2. Прогон через `fontaine`
выдаёт метрики автоматически.

### 5d — импорт в Layout

`src/layouts/public/Layout.astro` импорт-цепочка обновляется:

```ts
import "../../styles/tokens.css";
import "../../styles/fonts.css";   // ← новое, после tokens
import "../../styles/base.css";
import "../../styles/utilities.css";
```

### 5e — preload critical fonts в `<head>`

`src/components/public/SeoHead.astro` (или отдельный `<FontPreload />`
если head распухнет):

```astro
<link rel="preload" href="/fonts/cormorant-300.woff2"
      as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/outfit-vf.woff2"
      as="font" type="font/woff2" crossorigin>
```

`cormorant-300-italic.woff2` — НЕ preload (он на `<em>` акцентах,
загрузится lazy). Решается отдельно если LCP всё равно проседает.

### 5f — verification

- `pnpm build` → проверить что woff2 копируются в `dist/fonts/`
  (Astro статика из `public/` идёт as-is).
- `pnpm exec wrangler pages dev ./dist` → DevTools Network → woff2
  загружаются с `Cache-Control: public, max-age=31536000, immutable`
  (CF Pages дефолт для static).
- DevTools Rendering → Toggle "Emulate CSS media feature
  prefers-reduced-motion" не должно ничего сломать в шрифтах.
- Chrome Performance: LCP unchanged по сравнению с fallback (или
  выше — текст финального шрифта).
- CLS = 0 (или максимум 0.001 от swap'а; size-adjust обнуляет).

## Verification (cumulative)

После всех под-этапов:

```bash
pnpm lint && pnpm typecheck && pnpm build
pnpm exec wrangler pages dev ./dist
# открыть localhost:8788
```

Чек-лист:
- [ ] Hero `<h1>` — Cormorant Light 300 (тонкий serif), не Georgia.
- [ ] `<em>` в hero/who/instructors/final-cta — italic Cormorant.
- [ ] Eyebrow, body, CTA — Outfit (sans).
- [ ] DevTools Network — фактически загружаются 3 woff2 (cormorant
      italic — только когда `<em>` уже на экране).
- [ ] Lighthouse → CLS 0, LCP не хуже чем без шрифтов.
- [ ] Deploy → `https://moiraionline.pro/` рендерится с шрифтами
      без layout shift при первом visit.

## Out of scope

- Дополнительные веса Cormorant (400/500/600/700) — пока не
  используются в дизайне.
- Subset разбиение Latin / Cyrillic в отдельные файлы — если общий
  файл < 100KB, splitting не оправдан.
- Variable font Cormorant — не существует в open-source форме на
  момент 2026-05; берём static 300 + 300-italic.
- Font-loading API (`document.fonts.ready`) для оркестрации — не
  нужно при `font-display: swap` + правильных метриках.

## Critical files

- `public/fonts/cormorant-300.woff2`
- `public/fonts/cormorant-300-italic.woff2`
- `public/fonts/outfit-vf.woff2`
- `public/fonts/LICENSE.txt`
- `src/styles/fonts.css` (новый)
- `src/layouts/public/Layout.astro` (import chain)
- `src/components/public/SeoHead.astro` (preload links)
- `src/styles/tokens.css` (уже содержит `--font-display` /
  `--font-body` — не трогаем)

## Reference

- `docs/Design_system.md` §3 (типографика)
- `web.dev/fast/#optimize-your-fonts`
- `developer.mozilla.org/en-US/docs/Web/CSS/@font-face/size-adjust`
- Tools: `npx fontaine`, Monica Dinculescu Font Style Matcher
- `.agent/skills/astro/SKILL.md` § Static assets
