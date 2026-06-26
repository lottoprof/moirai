# ЛК performance audit — план тестирования

> Created 2026-06-14. **Status: DEFERRED** — тесты делаем позже
> когда накопится реальный пользовательский трафик и появятся
> жалобы на скорость. План готов к подъёму в любой момент.
>
> Goal: найти где именно тормозит загрузка страниц ЛК (student /
> instructor / admin), чтобы оптимизировать по факту, а не
> угадывать.

## Зачем

Edge cache для ЛК невозможен (user-specific). Но «медленно» бывает
из-за разных слоёв — D1, Worker cold start, JS bundle, hydration.
Без замеров фикс = угадайка.

## Целевые страницы (10 штук)

### Student
1. `/{locale}/dashboard/` — overview (моя когорта, прогресс)
2. `/{locale}/dashboard/cohort` — расписание + расписание сессий
3. `/{locale}/dashboard/modules/{slug}` — модуль (workbook + presentation tabs)
4. `/{locale}/dashboard/homework` — список ДЗ

### Instructor
5. `/{locale}/instructor/` — overview (когорты + очередь ревью)
6. `/{locale}/instructor/cohorts/{id}` — детали когорты
7. `/{locale}/instructor/reviews` — очередь ревью

### Admin
8. `/admin/` — overview (4 metrics + workload table + pipeline)
9. `/admin/cohorts` — список когорт
10. `/admin/calendar` — календарь сессий

## Метрики

### Server-side (curl + wrangler tail)

| Метрика | Как мерить | Целевой порог |
|---|---|---|
| TTFB | `curl -w '%{time_starttransfer}'` | <200ms warm, <500ms cold |
| Total time | `curl -w '%{time_total}'` | <400ms warm |
| HTML size (gzipped) | `curl -H 'Accept-Encoding: gzip' \| wc -c` | <50KB |
| Worker CPU time | `wrangler pages deployment tail` (`wallTime`) | <50ms warm |

### Client-side (Playwright + DevTools)

| Метрика | Целевой порог |
|---|---|
| DOMContentLoaded | <800ms |
| Load event | <1500ms |
| JS transferred (3G fast) | <300KB |
| LCP | <2500ms |
| TBT (Total Blocking Time) | <200ms |

### D1 instrumentation (временно)

Добавить логирование в `src/lib/server/db/` helper'ы:
- кол-во `.first()` / `.all()` / `.batch()` calls на request
- общий `D1 wall time` per request
- top-3 longest queries

Логировать в `console.log` с пометкой `[d1-audit]` чтобы потом
grep'нуть в `wrangler tail` и убрать после фиксов.

## Процесс замера

### 1. Cold + warm matrix (curl)

Для каждой из 10 страниц:
```bash
# 5x warm подряд
for i in 1 2 3 4 5; do
  curl -sw "warm $i: TTFB=%{time_starttransfer}s total=%{time_total}s size=%{size_download}\n" \
    -H "Cookie: session=$SESSION_TOKEN" \
    -o /dev/null "$URL"
done

# Cold через 5+ минут паузы (или из другого региона — VPN)
```

Записать в таблицу: `URL | TTFB warm avg | TTFB cold | size | wallTime`.

### 2. Browser audit (Playwright MCP)

Для 4 ключевых страниц (`/dashboard/`, `/dashboard/modules/{slug}`,
`/instructor/`, `/admin/`):

```javascript
// browser_evaluate
({
  domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
  loadEvent: performance.timing.loadEventEnd - performance.timing.navigationStart,
  resources: performance.getEntriesByType('resource').map(r => ({
    name: r.name.split('/').pop(),
    type: r.initiatorType,
    duration: r.duration,
    size: r.transferSize,
  })).sort((a, b) => b.duration - a.duration).slice(0, 10),
  totalJsSize: performance.getEntriesByType('resource')
    .filter(r => r.name.endsWith('.js'))
    .reduce((s, r) => s + r.transferSize, 0),
})
```

### 3. D1 audit (instrumented)

После шага 1 — посмотреть `wrangler pages deployment tail` логи,
сгруппировать по странице, идентифицировать:
- N+1 queries (если есть)
- Sequential queries которые можно `db.batch()`
- Queries без index (slow scan)

### 4. Bundle analyzer

```bash
pnpm build
# Посмотреть на dist/_worker.js/* и dist/client/*
du -sh dist/_worker.js dist/client/_astro/*.js | sort -h | tail -20
```

Топ-5 крупных chunks — кандидаты на code-split / lazy load.

## Deliverable

Один файл `.agent/plans/active/lk-performance-findings.md` с
таблицей замеров + 3-5 конкретных тикетов на оптимизацию,
отсортированных по impact/effort.

Пример формата:
```
| Страница | TTFB warm | TTFB cold | HTML | D1 queries | wallTime |
|---|---|---|---|---|---|
| /en/dashboard/ | 180ms | 420ms | 32KB | 7 | 65ms |
| ...
```

И bottleneck per page (один из):
- `Worker cold start` (>300ms cold, <100ms warm)
- `D1 slow query` (одна query >50ms)
- `D1 too many roundtrips` (5+ sequential queries)
- `JS hydration heavy` (TBT >300ms)
- `HTML too big` (>100KB gzipped)

## Lifecycle

1. Создать тестовый сессионный токен для student/instructor/admin
   (тест-аккаунты уже есть: test-student, test-instructor, test-admin)
2. Добавить временный D1 инструментинг в `src/lib/server/db/`
3. Прогнать curl замеры на 10 страницах × cold/warm
4. Прогнать Playwright на 4 ключевых страницах
5. Прогнать bundle analyzer
6. Свести в findings.md
7. По findings — отдельные планы на фиксы (D1 batching, lazy load
   islands, etc) с приоритезацией
8. Убрать инструментинг
9. `git mv` plan → done/

## Что НЕ делаем сейчас

- Никаких оптимизаций до замеров (premature optimization)
- Не трогаем public edge cache (отдельный план `cf-page-caching.md`)
- Не трогаем cron, Discord, instructor meeting UI (другие планы)
