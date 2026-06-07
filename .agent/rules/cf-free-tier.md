# Cloudflare Free Tier — обязательные проверки

> **Проект работает на бесплатных тарифах Cloudflare.** Перед
> реализацией любой фичи, которая использует CF-сервис (Workers, Pages,
> D1, R2, KV, Email, Stream, AI, Queues, etc.) — **обязательно прямой
> ресерч актуальных лимитов**.

## Правило (HARD-RULE)

**Запрещено** предлагать или реализовывать фичу, опираясь только на
знания из памяти про CF-лимиты. До любых архитектурных решений или
кода:

1. **WebFetch** актуальной страницы лимитов сервиса (`developers.cloudflare.com/<service>/platform/limits/`).
2. **WebSearch** "Cloudflare <service> free tier <текущий год>" если
   docs страница неполная.
3. **Зафиксировать** найденные лимиты в обсуждении ИЛИ в комментариях
   к коду со ссылкой на источник.

## Что значит "лимит"

Per service проверить:

| Параметр | Где смотреть |
|---|---|
| Stora­ge cap (GB) | `<service>/platform/limits/` |
| Request/op cap (per day / per month) | то же |
| CPU time per request (Workers — критично!) | `workers/platform/limits/` |
| Bandwidth / egress | `<service>/platform/pricing/` |
| Free vs Paid feature gates | `<service>/platform/pricing/` |
| Daily vs monthly windows | docs |
| Required upgrade triggers (нужен ли Paid для нашего use case) | dual-check |

## Почему это правило

Я (LLM) **систематически ошибаюсь** на CF-лимитах:
- Knowledge cutoff не покрывает changes последних месяцев
- CF часто меняет limits (увеличивает quotas, переносит фичи между
  планами)
- Beta → GA transitions меняют доступность и pricing
- "Email Routing бесплатно" vs "Email Sending только Paid" — путаница
  без ресерча
- Workers Free CPU limit 10ms vs Paid 30s — критично для архитектуры

## Применение

**При discovery / design phase:**
- При первом упоминании любого CF-сервиса в discovery — WebFetch limits
  перед обсуждением вариантов.
- Не предлагать паттерны (pre-signed URL, proxy через worker, etc.) без
  знания актуальных limits — выбор паттерна зависит от лимитов.

**При написании кода:**
- В comment рядом с сервис-binding или fetch к CF API — указать source
  + дату ресерча, если решение завязано на конкретный лимит.

**При планировании:**
- В `.agent/plans/active/<plan>.md` секция "CF tariff verification" с
  ссылками + ключевыми цифрами.

## Примеры правильного применения

✅ "Прежде чем выбрать Cloudflare Stream vs R2 для видео — проверю
limits страниц обоих" → WebFetch → решение.

✅ В коде:
```ts
// Pre-signed URL pattern (не worker proxy):
// Workers Free CPU limit 10ms per request → upload 100MB через worker
// не пройдёт. Verified: https://developers.cloudflare.com/workers/platform/limits/
// 2026-06-07.
```

## Примеры неправильного применения (то что НЕ делать)

❌ "Resend free 3K/мес, 100/день" — без ссылки на актуальные доки
Resend (и без подтверждения это **Cloudflare-relevant**).

❌ "На бесплатном CF можно отправлять 3000 emails/мес" — без проверки
текущих условий (это могло измениться, лимиты часто пересматриваются).

❌ "Workers Cron Triggers — 5 jobs free" — из памяти. Надо WebFetch.

---

**Этот файл создан 2026-06-07 после инцидента: упустил CF Email Service
limits (Email Sending — только Workers Paid), пришлось переделывать.**

См. также:
- `.agent/rules/edge-compat.md` — runtime ограничения
- `.agent/rules/security.md` — secrets и vars
