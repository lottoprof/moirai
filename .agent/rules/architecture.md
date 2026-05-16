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
│   │   ├── *.astro              # публичные SEO-страницы (programmes/instructors/...)
│   │   ├── dashboard/**         # Student ЛК (role: 'student')
│   │   ├── instructor/**        # Instructor zone (role: 'instructor')
│   │   ├── account.astro        # cross-zone — любая роль, layout по primary role
│   │   ├── inactive.astro       # заглушка для deactivated user'ов
│   │   ├── login.astro, register.astro, password-reset.astro, verify-email-pending.astro
│   │   └── ...
│   ├── admin/**                 # Admin panel (без локали, role: 'admin')
│   └── api/**                   # серверные эндпоинты (без локали)
├── content/
│   ├── programmes/[id].{locale}.mdx   # шаблоны: default_modules + price + features
│   ├── instructors/[id].{locale}.mdx  # публичные био (faculty pages)
│   ├── pages/[id].{locale}.mdx        # about, faq, contact, legal
│   ├── journal/[id].{locale}.mdx
│   ├── works/[id].{locale}.mdx
│   └── voice-guide.md
│   # Модули НЕ в Content Collection — они в D1+R2, источник в внешнем
│   # репозитории методистов (см. decisions 2026-05-17).
│   # Bundles удалены как сущность; tier ушёл в programme.features.
├── components/
│   ├── public/**                # vanilla, CSS-only
│   ├── dashboard/**             # student islands, Vidstack player
│   ├── instructor/**            # instructor islands (review queue, compose)
│   └── admin/**                 # CRUD-интерфейс
├── layouts/
│   ├── public/**
│   ├── dashboard/**
│   ├── instructor/**
│   └── admin/**
├── lib/
│   ├── server/**                # edge-only код (биндинги, crypto.subtle, MoR webhook, guards, auth-redirect)
│   └── shared/**                # изоморфные утилиты
├── middleware.ts                # locale detection; auth-guards в frontmatter страниц (через requireRole)
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
2. **Student ЛК `[locale]/dashboard/**`** — Astro islands с
   `client:idle` / `client:visible`. Vidstack живёт здесь.
   Локаль обязательна. Guard: `requireRole(ctx, 'student')`.
3. **Instructor zone `[locale]/instructor/**`** — Astro islands.
   Guard: `requireRole(ctx, 'instructor')`. Compose UI для модулей,
   review queue homework.
4. **Admin panel `/admin/**`** — без локали. Guard:
   `requireRole(ctx, 'admin')`. CRUD-формы поверх API.
5. **Cross-zone `[locale]/account`** — guard: любая аутентификация
   + `user.deactivated_at IS NULL` (deactivated → redirect на
   `/inactive`). Layout динамический по primary role.
6. **Серверный слой `src/pages/api/**` + `src/lib/server/**`** —
   единственный путь к биндингам. Edge-compat обязателен (см.
   `edge-compat.md`).
7. **Content Collections `src/content/**`** — данные (frontmatter +
   MDX). Страницы читают через `getCollection`, не дублируют
   контент. Build-time валидация (`zod` schema, translation pairs).
   **Модули НЕ здесь** — они в D1+R2 (см. decisions 2026-05-17).
8. **D1 + R2 + KV** — runtime-хранилища. См. ниже.

## Локализация

- Path-prefix: `/{locale}/...` для публичного, dashboard, instructor,
  account, inactive. `astro.config.mjs` → `i18n.prefixDefaultLocale: true`.
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
