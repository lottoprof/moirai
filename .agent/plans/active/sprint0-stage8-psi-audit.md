# Sprint 0 Stage 8 — PSI audit → 100/100/100/100

## Context

После Stage 5 (fonts), 6 (schema), 7 (i18n) публичная главная
визуально и структурно готова. Stage 8 — финальная доводка Core
Web Vitals + Lighthouse-аудит до целевых **100/100/100/100** на
PageSpeed Insights (mobile + desktop, обе локали).

Текущий статус (после Stage 4): главная отдаётся, SSL=strict,
force HTTPS, HSTS off. Шрифты + JSON-LD ещё не подключены — это
сделает Stage 5+6 до Stage 8.

## Baseline (что замерить ПЕРЕД работой)

После завершения Stage 5+6+7 — прогнать PSI и записать сюда
цифры:

| Метрика | EN mobile | EN desktop | RU mobile | RU desktop |
|---|---|---|---|---|
| Performance | ? | ? | ? | ? |
| Accessibility | ? | ? | ? | ? |
| Best Practices | ? | ? | ? | ? |
| SEO | ? | ? | ? | ? |
| LCP | ? ms | ? ms | ? ms | ? ms |
| CLS | ? | ? | ? | ? |
| INP | ? ms | ? ms | ? ms | ? ms |
| TBT | ? ms | ? ms | ? ms | ? ms |

Цель — все 100 + LCP <2.5s, CLS <0.1, INP <200ms.

## Этапы

### 8a — Performance: LCP

LCP элемент сейчас — `<h1 class="hero__title">`. Подтвердить через
PSI → Performance audit → "Largest Contentful Paint element".

Возможные тюнинги:
- `<link rel="preload">` для `cormorant-300.woff2` (если не сделано
  в Stage 5e).
- Inline критичный CSS (`<style is:inline>` в `<head>`) — обычно
  не нужно у Astro: CSS бандл ~30KB и грузится параллельно.
- Проверить что `dist/_astro/sharp*.mjs` НЕ попадает в клиентский
  bundle (sharp — build-time only).

### 8b — Performance: CLS

CLS должен быть 0 у нас (нет картинок, нет ads), но проверить:
- Hero stagger animation `rise` — `opacity` + `translateY` →
  composite-only, безопасно для CLS.
- Font swap — нулевой CLS благодаря `size-adjust` из Stage 5c.
  Проверить экспериментально: DevTools → Network → Slow 3G + JS
  выключен → перезагрузка → визуально не "прыгает".
- Ticker animation — `translateX` (compositor), без CLS.

### 8c — Performance: INP / TBT

JS на главной — минимум:
- `Nav.astro` — passive `scroll` listener (легчайший).
- Никаких `client:*` директив.

Проверить:
- `ls dist/_astro/*.js` — содержимое и размер. Должен быть
  один-два маленьких файла (manifest + Astro runtime).
- DevTools Performance → main thread tasks <50ms каждая.
- `wrangler tail` на проде — нет рантайм-ошибок.

### 8d — Accessibility (= 100)

Лайтхаус A11y:
- Контраст: amber `#D4820A` на ink `#0D0B09` → ratio ~5.9:1 (WCAG AA
  normal text — 4.5:1, AA large — 3:1). Должно быть OK для headings
  и CTA текста. Проверить через axe DevTools.
- Skip link (`.skip-link`) работает: Tab от начала страницы →
  фокус на `<a href="#main">`.
- FAQ `<details>/<summary>` — native a11y, Tab + Enter/Space.
- `<img alt>` — пока картинок нет (Stage 9 принесёт). Проверить
  что все instructor/work card images получают `alt`.
- `prefers-reduced-motion: reduce` — глобальное правило в `tokens.css`
  гасит все animation, проверить через DevTools → Rendering.

### 8e — Best Practices

Лайтхаус Best Practices:
- HTTPS only ✓ (always_use_https=on в zone)
- No console errors — проверить DevTools на проде на главной +
  скролл всей страницы (раскрытие FAQ items).
- `<!doctype html>` ✓
- No third-party cookies/трекеров (у нас нет, и не будет до
  отдельного решения по analytics).
- **HSTS включить** (после нескольких дней стабильной работы прода):

  ```bash
  TOKEN=<short-lived с Zone Settings:Edit>
  ZONE=8d1fe5f529fd8a010c6086b6623b44b3
  curl -X PATCH \
    "https://api.cloudflare.com/client/v4/zones/$ZONE/settings/security_header" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"value":{"strict_transport_security":{"enabled":true,"max_age":31536000,"include_subdomains":true,"preload":false}}}'
  ```

  `preload: false` — пока не подаём в HSTS preload list. После 6-12
  месяцев стабильной работы можно подать через `hstspreload.org` —
  отдельная задача.

### 8f — Security headers через `public/_headers`

CF Pages читает файл `_headers` из корня выхода. Создать
`public/_headers`:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

CSP — отдельно, требует whitelist. Отложим до момента, когда
поймём какие external scripts будут (analytics? Plausible
self-hosted? — отдельный stage).

### 8g — SEO score (= 100)

Лайтхаус SEO обычно у нас 100 (canonical, hreflang, title,
description, viewport, lang — всё на месте). Проверки:

- `public/robots.txt` — пока нет, добавить:

  ```
  User-agent: *
  Allow: /
  Disallow: /admin/

  Sitemap: https://moiraionline.pro/sitemap-index.xml
  ```

- На корне `/` — middleware ставит `X-Robots-Tag: noindex`
  (проверено в Stage smoke). Подтвердить, что это всё ещё работает
  после всех изменений.
- На admin-страницах — `noindex` через мета и/или middleware.
  Stage 8 trigger — проверить, не появилось ли admin-страниц.

### 8h — финальная PSI прогонка

После 8a-8g:
```
https://pagespeed.web.dev/analysis?url=https://moiraionline.pro/en/&form_factor=mobile
https://pagespeed.web.dev/analysis?url=https://moiraionline.pro/en/&form_factor=desktop
https://pagespeed.web.dev/analysis?url=https://moiraionline.pro/ru/&form_factor=mobile
https://pagespeed.web.dev/analysis?url=https://moiraionline.pro/ru/&form_factor=desktop
```

Заполнить таблицу финальными значениями — 100/100/100/100 во всех
ячейках. Если не дотягиваем — итеративная доводка, фиксим конкретные
audit'ы.

## Verification

После всех этапов:
- [ ] PSI mobile EN — 100/100/100/100
- [ ] PSI mobile RU — 100/100/100/100
- [ ] PSI desktop EN — 100/100/100/100
- [ ] PSI desktop RU — 100/100/100/100
- [ ] HSTS включён: `curl -I https://moiraionline.pro/ | grep -i hsts`
      → `strict-transport-security: max-age=31536000; includeSubDomains`
- [ ] Security headers видны: `curl -I https://moiraionline.pro/en/ |
      grep -iE 'frame-options|content-type-options|referrer-policy|permissions-policy'`
- [ ] `https://moiraionline.pro/robots.txt` отдаётся, ссылается на
      правильный sitemap
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные

## Out of scope

- **CSP** (Content-Security-Policy) — отдельный stage когда определимся
  с внешним JS / fonts / analytics. Сейчас всё self-hosted → CSP можно
  будет сделать жёсткий.
- **HSTS preload list submission** — после 6-12 месяцев стабильного
  HSTS, одноразовая процедура через `hstspreload.org`.
- **Self-hosted analytics** (Plausible / Umami / CF Web Analytics) —
  отдельный stage.
- **Image pipeline** (sharp + R2 + responsive `<picture>`) — отдельная
  задача когда content-team подкинет фото и видео.
- **Worker A/B testing** (на Cloudflare Workers) — отдельная архитектурная
  задача.

## Critical files

- `public/_headers` (новый)
- `public/robots.txt` (новый)
- Zone settings — HSTS включается через API (см. `cf_account.md` memory
  + `.agent/skills/deploy/SKILL.md` § Custom domain via API)

## Reference

- `docs/Home_page_SEO.md` §11 (perf ↔ SEO)
- `web.dev/vitals` — LCP/CLS/INP thresholds
- developer.mozilla.org — Headers: HSTS, X-Frame, Permissions-Policy
- CF Pages docs — `_headers` file format
- `.agent/skills/deploy/SKILL.md` § Production state — zone settings
