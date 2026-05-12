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
- **2026-05-12** — Auth model: multi-method (password + OAuth) с
  отдельной таблицей `auth_methods`. Переработка `users` (убраны
  `password_hash` + `oauth_provider/oauth_id` колонки). Добавлены
  `audit_log`. OAuth: Google + Discord на старте, Discord БЕЗ email
  отклоняется. JWT 15min access + D1 refresh-session. PBKDF2-SHA256
  600k iter (OWASP 2023). Login fail → generic `invalid_login` +
  UI-подсказка "Forgot? Or use social". Native Astro endpoints (без
  Hono). Architecture §9: 17 → 19 таблиц.
- **2026-05-12** — Body font: Outfit → **Manrope Variable**. Outfit
  не содержит Cyrillic glyph'ов (только Latin + Latin Ext + Vietnamese),
  для bilingual проекта блокер. Manrope VF — близкий geometric sans,
  полная Cyrillic+Cyrillic-Ext поддержка, OFL, активная поддержка.
  Обновлены `tokens.css`, `Design_system.md` §3, Stage 5 план.
- **2026-05-11** — Production domain & deploy-first: canonical =
  `https://moiraionline.pro` (apex, без www); www — alias того же
  Pages-проекта. CF аккаунт `nastya.zasypkina@gmail.com` (ID
  `f168a4…`), Pages project `moirai` (URL `moirai-c6e.pages.dev`
  — глобальное имя `moirai` было занято, CF добавил суффикс).
  Зона `moiraionline.pro` (ID `8d1fe5f5…`): SSL=strict,
  always_use_https=on, min_tls=1.2, cname_flattening on, HSTS off.
  Apex и www подключены через Pages API + ручные CNAME-записи на
  `moirai-c6e.pages.dev`. Полный snapshot в
  `.agent/skills/deploy/SKILL.md` § Production state.
