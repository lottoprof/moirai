# Architecture Rules (moirai)

Эта страница — короткий нормативный срез. Источник истины по
архитектуре проекта — `docs/Architecture.md` (Moirai
Architecture v0.8.x).

## Слои и URL-намespace

Проект делится на три слоя кода + слой данных. Это инвариант,
проверяемый ESLint-плагинами и reviewer-агентом.

```
src/
├── pages/
│   ├── [locale]/
│   │   ├── *.astro              # публичные SEO-страницы (programmes/bundles/...)
│   │   └── dashboard/**         # ЛК (student/instructor)
│   ├── admin/**                 # админка (БЕЗ локали, role=admin)
│   └── api/**                   # серверные эндпоинты (без локали)
├── content/
│   ├── programmes/[id].{locale}.mdx
│   ├── bundles/[id].{locale}.mdx
│   ├── instructors/[id].{locale}.mdx
│   ├── segments/[id].{locale}.mdx
│   ├── pages/[id].{locale}.mdx          # about, faq, contact, legal
│   ├── journal/[id].{locale}.mdx
│   ├── works/[id].{locale}.mdx
│   └── voice-guide.md
├── components/
│   ├── public/**                # vanilla, CSS-only
│   ├── dashboard/**             # islands, Vidstack player
│   └── admin/**                 # CRUD-интерфейс
├── layouts/
│   ├── public/**
│   ├── dashboard/**
│   └── admin/**
├── lib/
│   ├── server/**                # edge-only код (биндинги, crypto.subtle, MoR webhook, resolveAndAuthorize)
│   └── shared/**                # изоморфные утилиты
├── middleware.ts                # auth-guard'ы для /[locale]/dashboard и /admin
├── styles/**
└── env.d.ts                     # типы биндингов + Astro.locals
db/
└── types.ts                     # ручные TS-типы D1, обновляются вместе с миграциями
migrations/
└── NNNN_<name>.sql              # D1-миграции (top-level)
public/                          # статика (favicon, fonts, og-images)
```

## Правила слоёв

1. **Публичный слой `[locale]/*.astro`** — без JS-фреймворков, без
   `client:*`. Vanilla `<script>` и CSS-only анимации.
   SEO-критично. `prefixDefaultLocale: true` — префикс локали
   обязателен для всех языков.
2. **ЛК `[locale]/dashboard/**`** — Astro islands с
   `client:idle` / `client:visible`. Vidstack живёт здесь.
   Локаль обязательна.
3. **Админка `/admin/**`** — без локали. `users.role = 'admin'`,
   guard через `src/middleware.ts`. Внешний layout, CRUD-формы.
4. **Серверный слой `src/pages/api/**` + `src/lib/server/**`** —
   единственный путь к биндингам. Edge-compat обязателен (см.
   `edge-compat.md`).
5. **Content Collections `src/content/**`** — данные (frontmatter +
   MDX). Страницы читают через `getCollection`, не дублируют
   контент. Build-time валидация (`zod` schema, translation pairs,
   уникальные id между programmes и bundles).
6. **D1 + R2 + KV** — runtime-хранилища. См. ниже.

## Локализация

- Path-prefix: `/{locale}/...` для всех публичных и dashboard
  путей. `astro.config.mjs` → `i18n.prefixDefaultLocale: true`.
- `/admin/**` и `/api/**` — без локали.
- `/` редиректит по `Accept-Language`.
- Translation pairs: каждый контентный объект существует во всех
  активных локалях (или явно `monolingual: true` в frontmatter).
  Build-step падает при отсутствии пары.
- SEO baseline на каждой публичной странице: `title`, `description`,
  `canonical` (с локалью), `hreflang`, OG/Twitter, Schema.org
  (`Course`, `Person`, `FAQPage`, `VideoObject`, `Offer`).

## Рендеринг и адаптер

- Adapter: `@astrojs/cloudflare`.
- Режим SSR (`output: "server"` или `"hybrid"`) фиксируется
  отдельным решением в `decisions.md` при первом скаффолде.
- Биндинги читаются исключительно через
  `Astro.locals.runtime.env.<NAME>`.
- Типы биндингов — `worker-configuration.d.ts` (генерируется
  `pnpm exec wrangler types`). Не редактировать вручную.
- TS-типы D1 — `db/types.ts`, пишутся вручную, обновляются
  атомарно с миграциями.

## Хранилища

| Слой | Назначение | Что лежит |
|------|------------|-----------|
| **D1** | реляционные runtime-данные | 17 таблиц: users, runs, run_modules, enrollments, sessions, session_*, homework, feedback, modules, module_content, payments, promo_codes, referrals, resources, resource_consumption, auth_sessions |
| **R2** | приватные/публичные бинарники и тела | bucket `moirai-media` с префиксами `content/` (markdown тела модулей) и `media/` (mp4/jpg/pdf) |
| **KV** | глобальные настройки сайта | namespace `moirai-config`: ui:*, flags:*, contact:*, seo:* |

**В KV не лежит:** цены, программы, инструкторы, локали,
промо-коды, реферальные коды, resource caps, персональные данные,
секреты. Полный stop-list — в Architecture.md §13.

**Без ORM.** Запросы — `env.DB.prepare(sql).bind(...).first()/all()/run()`.
Миграции — `migrations/NNNN_*.sql`, применение через
`wrangler d1 migrations create/apply`. См. `agents/schema.md`.

## Gated media

Приватные R2-объекты раздаются только через
`/api/media/[type]/[id]` с проверкой `resolveAndAuthorize`
(см. `agents/pages-ssr.md`). Прямые ссылки на приватные ключи —
запрет (см. `forbidden.md`). Публичные ассеты идут через
`media.moirai.film` (R2 public alias) без gate.

## Источник истины

- Архитектура и инварианты — `docs/Architecture.md`.
- Решения — `.agent/rules/decisions.md` (manifest) +
  `decisions_archive.md` (полные ADR).
- Конкретные программы / тиры / инструкторы / локали — Content
  Collections / `astro.config.mjs` / D1 (см. Architecture.md §1).
- Никаких чисел и имён программ свободным текстом в коде страниц
  (см. `forbidden.md`).
