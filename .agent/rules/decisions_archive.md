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

---

## 2026-05-08: agent roster v0.8.1 alignment

**Контекст.** После stage1 (pnpm) и stage2 (rules align с
Architecture v0.8.1) `rules/boundaries.md` начал ссылаться на
`agents/astro-dashboard.md`, `astro-admin.md`, `content.md` —
файлов которых физически нет в `.agent/agents/`. Существующий
`astro-app.md` описывал старый namespace `src/pages/app/**`,
не совпадающий с v0.8.1 (`[locale]/dashboard/**` для ЛК,
`/admin/**` без локали для админки). `schema.md` описывал
миграции в `schema/migrations/`, тогда как v0.8.1 фиксирует
`migrations/` top-level + `db/types.ts` (ручные TS-типы, без ORM).

**Решение.**

- `astro-app.md` → `astro-dashboard.md` (`git mv` + переписать
  scope под `src/pages/[locale]/dashboard/**`,
  `src/components/dashboard/**`, роли student/instructor).
- Добавлен `astro-admin.md`: `src/pages/admin/**` без локали,
  `users.role = 'admin'` guard, CRUD поверх API, `noindex`.
- Добавлен `content.md`: `src/content/**` (programmes с тирами,
  bundles, instructors, segments, pages, journal, works,
  voice-guide) + `drafts/**` (agent journal pipeline).
  Изменения `src/content/config.ts` (zod-схемы коллекций) —
  через handoff в `pages-ssr`.
- `astro-public.md`: scope `src/pages/[locale]/*.astro` (без
  `dashboard/`, без `admin/`), запрет импорта из
  `components/dashboard/`, `components/admin/`, явное anti-hardcode.
- `pages-ssr.md`: добавлены `src/content/config.ts` и `db/types.ts`;
  `db/types.ts` обновляется атомарно с миграциями (handoff из
  `schema`).
- `schema.md`: миграции в `migrations/NNNN_*.sql` (top-level),
  применение через `wrangler d1 migrations create/apply`,
  reference-схема упразднена.
- `reviewer.md`: чек-лист boundaries расширен до
  public/dashboard/admin/content; auth-guard под
  `[locale]/dashboard/**` и `admin/**`.
- `e2e.md`: сценарии — locale-prefix, gated media, admin smoke.
- `AGENTS.md`: PROJECT AGENT MAP, PROJECT STACK и DELEGATION enum
  переписаны под новый ростер.
- Точечные правки `rules/security.md`, `skills/common/security.md`,
  `skills/vidstack/SKILL.md`, `skills/wrangler/SKILL.md` —
  убраны устаревшие ссылки на `src/pages/app/**` и
  `schema/migrations/`.

**Альтернативы.**

- Оставить `astro-app` и переименовать в `dashboard` только
  путь — отказ: ростер должен синхронно отражать реальные зоны,
  иначе делегирование выдаёт неконсистентные spec'и.
- Объединить `astro-admin` со scope'ом `pages-ssr` — отказ:
  админка имеет UI-слой (CRUD-формы, layouts), это work для
  UI-агента, а не серверного.
- Оставить миграции в `schema/migrations/` — отказ: расходится
  с Architecture v0.8.1 §12 (`migrations/` top-level + `db/types.ts`)
  и со standard wrangler layout'ом.

**Причина.** Без alignment'а `boundaries.md` ссылался на
несуществующих агентов, а `astro-app.md` описывал отсутствующий
в архитектуре namespace. Делегирование от лида ломалось бы
из-за рассинхрона spec ↔ реальные файлы. Новый ростер однозначно
маппится на UI-зоны Architecture v0.8.1 (public / dashboard /
admin / content / server / schema), что упрощает routing задач
и ревью boundaries.
