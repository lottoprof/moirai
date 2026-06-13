# CF Pages caching — ускорить загрузку

> Created 2026-06-13. Не блокер, оптимизация. Кешируем где можно
> без потери UX.

## Цель

Сократить TTFB и нагрузку на worker для страниц, контент которых
не зависит от auth и меняется редко. Эффект — заметно для первой
загрузки в новом регионе, особенно когда CF edge холодный.

## Что трогаем (gating)

Перед любым `Cache-Control: public` на route — **обязательно**
WebFetch актуальной CF Pages caching доc'и:

- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/cache/concepts/cache-control/
- https://developers.cloudflare.com/pages/configuration/headers/

CF free tier лимиты в memory feedback — не полагаться на знания.

## Категоризация страниц

### A. Полностью статичные / SSG
SSR не нужен, либо результат не меняется по user. Кешировать
агрессивно (1+ день):

| Route | TTL | Notes |
|---|---|---|
| `/[locale]/` (главная) | 1h | Меняется при обновлении контента — invalidate через deploy |
| `/[locale]/programmes/[slug]` | 1h | Контент из Content Collection |
| `/[locale]/faq` | 1h | |
| `/[locale]/contact` | 1d | Меняется редко |
| `/[locale]/works` + `/[locale]/works/[slug]` | 1h | Когда добавится больше работ |
| `/[locale]/journal` + `/[locale]/journal/[slug]` | 1h | |
| `/[locale]/legal/{privacy,terms,refund,cookies}` | 1d | DRAFT сейчас, обновление редко |
| `/[locale]/ai-module-waitlist` | 1d | |
| Static assets (`/fonts/*`, `/images/*`) | 1y | Уже автоматически через CF |

### B. Auth-aware, но cache по cookie / auth-state
Страницы где UI зависит от login state (например главная показывает
"Sign in / Sign up" vs "Account"). Сейчас это решается через JS на
клиенте — после first paint. Значит **сам HTML can be cached**.
Включая `/[locale]/`.

### C. SSR private (auth required)
Никогда не кешировать публично — пользовательский контент:

- `/[locale]/dashboard/**`
- `/[locale]/instructor/**`
- `/admin/**`
- `/[locale]/account`
- `/[locale]/apply` (показывает cohorts из D1 — может меняться часто)
- `/[locale]/apply/contact`
- `/[locale]/checkout`
- `/[locale]/login` / `/register` / `/password-reset` (формы с CSRF)

Эти страницы оставляем `Cache-Control: private, no-store` (как
сейчас в большинстве — проверить через curl).

### D. API endpoints
- `/api/auth/me` — private no-cache (auth state)
- `/api/modules/[slug]/images/[file]` — `private, max-age=2592000`
  (30 дней, как мы уже поставили)
- `/api/account/*` — no-cache
- остальные API — индивидуально

## Как реализовать

CF Pages поддерживает `_headers` файл в `public/`:

```
# public/_headers
/en/
  Cache-Control: public, max-age=3600, s-maxage=3600

/ru/
  Cache-Control: public, max-age=3600, s-maxage=3600

/en/programmes/*
  Cache-Control: public, max-age=3600, s-maxage=3600

# ... etc
```

ИЛИ inline через `Astro.response.headers.set('Cache-Control', ...)`
в frontmatter каждой публичной страницы (более точечно, но больше
кода).

Рекомендую `_headers` — централизованно, без правок в каждом
файле.

## Open questions перед стартом

1. **Сейчас какие routes уже кешируются?** Сделать `curl -sI` по
   списку выше, посмотреть `cf-cache-status`. Может что-то уже в
   HIT через дефолтные CF rules.
2. **Какой TTL критичен** — 1 час разумно для большинства, но
   если методист часто меняет programmes — может 10 минут.
3. **Invalidation на deploy** — CF Pages автоматически invalidate
   cache при новом деплое? Подтвердить через WebFetch.
4. **Stale-while-revalidate** — добавить
   `stale-while-revalidate=60`? Чтобы при revalidation не было TTFB
   спайка.

## Метрики

После применения замерить:

```bash
# До
curl -sw "TTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n" \
  -o /dev/null https://moiraionline.pro/en/

# После — повторно (cache warm)
```

Цель — TTFB < 100ms для cache HIT на edge.

## Lifecycle

1. WebFetch caching доку → собрать актуальные ограничения
2. Curl audit текущих cache headers
3. Решить TTL per category (с lottoprof)
4. Создать `public/_headers` + commit
5. Deploy + метрики
6. `git mv` plan → done/
