# Decisions Archive (moirai)

Полные записи архитектурных решений. Каждая запись — заголовок с датой
и краткой темой, далее блоки **Контекст / Решение / Альтернативы /
Причина**. Manifest и порядок ведения — в `decisions.md`.

---

## 2026-05-08: stack & layering — Astro 5 + Cloudflare Pages + Wrangler

**Контекст.** Стартуем фронтенд-проект moirai. Требования: SEO-важный
публичный слой с минимальной runtime-нагрузкой, защищённая зона
личного кабинета с медиаплеером, серверный рендеринг для
персонализированных страниц, развёртывание на инфраструктуре с
быстрым edge-доступом.

**Решение.**

- **Framework**: Astro 5 (Vite + TypeScript под капотом).
- **Hosting**: Cloudflare Pages.
- **Adapter**: `@astrojs/cloudflare` (SSR через CF Workers runtime).
- **Public layer**: vanilla JS (или ноль JS) + CSS-only анимации,
  никаких UI-фреймворков, никаких `client:*` директив. SEO-критично.
- **App layer (ЛК)**: Astro islands с `client:idle` / `client:visible`
  по умолчанию; Vidstack для медиаплеера в защищённой зоне.
- **Tooling**: wrangler — канонический инструмент для dev
  (`wrangler pages dev`), деплоя (`wrangler pages deploy`), секретов
  (`wrangler pages secret put`), миграций D1
  (`wrangler d1 execute`) и генерации типов биндингов
  (`wrangler types`).
- **Структура слоёв** в `src/` зафиксирована в
  `rules/architecture.md` и `rules/boundaries.md`.

**Альтернативы.**

- Next.js / Remix на Vercel — отказ: тяжелее в публичном слое, хуже
  совмещается с CF edge runtime без compromises.
- Чистые Cloudflare Workers без Astro — отказ: SSG/SSR из коробки и
  единый код для public+app проще через Astro.
- SvelteKit на CF — отказ: Astro лучше подходит под требование
  «минимум JS в публичном слое» (островная модель).
- Полностью статика без SSR — отказ: для ЛК нужен SSR с
  персонализированными данными.

**Причина.** Astro даёт zero-JS по умолчанию для публичного слоя
(SEO + perf), островную гидрацию для ЛК (можно подмешать Vidstack
без раздувания публичных страниц), и интегрируется с CF Pages SSR
через официальный адаптер. Wrangler — родной CLI экосистемы CF,
покрывает dev / deploy / secrets / D1 / KV / R2 без лишних обёрток.
