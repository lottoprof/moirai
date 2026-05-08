# Decisions (manifest)

Индекс архитектурных решений проекта **moirai**.
Полные записи (Контекст / Решение / Альтернативы / Причина) живут
в `decisions_archive.md` и читаются по требованию.

**Правило ведения:** новое решение — 1 строка сюда + полное тело
в archive. Перед работой в затронутой зоне — `grep` по дате/заголовку
в archive, потом действие.

## 2026-05

- **2026-05-08** — Стек проекта: Astro 5 (TS) + `@astrojs/cloudflare`
  adapter + Cloudflare Pages; публичный SEO-слой = vanilla JS +
  CSS-only анимации; защищённая зона (ЛК) = Astro islands +
  Vidstack; деплой и dev — через wrangler.
- **2026-05-08** — Agent roster v0.8.1: ростер `.agent/agents/`
  выровнен с Architecture v0.8.1. `astro-app` → `astro-dashboard`
  (`[locale]/dashboard/**`), добавлены `astro-admin` (`/admin/**`,
  без локали, role=admin) и `content` (`src/content/**` +
  `drafts/**`). D1-миграции переехали в `migrations/` (top-level)
  + `db/types.ts` (ручные TS-типы, без ORM).
- **2026-05-08** — Sprint 0 bootstrap: `output: "server"` (опт-ин
  prerender per-route для статики), locales `[en, ru]`,
  `prefixDefaultLocale: true`, `compatibility_date 2026-05-01`,
  Node 22 LTS, pnpm 10.18 через corepack, `wrangler types` →
  `worker-configuration.d.ts` (runtime types заменили
  `@cloudflare/workers-types`).
