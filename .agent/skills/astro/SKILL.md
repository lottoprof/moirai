---
name: astro
description: Use this skill when working on Astro 5 project structure, page routing, layouts, components, island hydration directives, the @astrojs/cloudflare adapter, Astro.locals.runtime access to bindings, or astro.config.mjs. Read before editing anything under src/pages, src/components, src/layouts, or astro.config.mjs.
---

# Astro 5 — Project Skill

## Что в стеке

- **Astro 5** — framework, использует Vite + TypeScript под капотом.
- **Adapter** — `@astrojs/cloudflare` (SSR через Cloudflare Workers
  runtime).
- **Hosting** — Cloudflare Pages.

## Структура проекта (целевая)

```
src/
├── pages/
│   ├── [locale]/
│   │   ├── index.astro          # публичный landing
│   │   ├── *.astro              # публичные SEO-страницы
│   │   └── dashboard/           # ЛК (student/instructor)
│   ├── admin/                   # админка (без локали, role=admin)
│   └── api/
│       └── <route>.ts           # серверные эндпоинты (без локали)
├── content/                     # Content Collections (programmes,
│   └── ...                      # bundles, instructors, journal, ...)
├── components/
│   ├── public/                  # vanilla, CSS-only
│   ├── dashboard/               # islands, Vidstack
│   └── admin/                   # CRUD-формы
├── layouts/
│   ├── public/
│   ├── dashboard/
│   └── admin/
├── lib/
│   ├── server/                  # edge-only код
│   └── shared/                  # изоморфные утилиты
├── middleware.ts                # auth-guard для dashboard и admin
├── styles/
└── env.d.ts                     # типы биндингов + Astro.locals
db/
└── types.ts                     # ручные TS-типы строк D1
migrations/
└── NNNN_<name>.sql              # D1-миграции
public/                          # статика (favicon, fonts, og-images)
astro.config.mjs
wrangler.toml
package.json
tsconfig.json
worker-configuration.d.ts        # генерируется wrangler types
```

## astro.config.mjs (минимальный шаблон)

```js
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",                  // или "hybrid" — фиксируется в decisions.md
  adapter: cloudflare({
    platformProxy: { enabled: true } // даёт Astro.locals.runtime в dev
  }),
  vite: {
    // build-time only — здесь Node API разрешены
  }
});
```

## Островная гидрация — директивы

| Директива | Когда |
|-----------|-------|
| `client:load` | компонент нужен сразу при отрисовке (редко) |
| `client:idle` | по умолчанию для большинства островов в `dashboard/` |
| `client:visible` | компонент гидрируется при скролле в viewport |
| `client:media="(...)"` | гидрация при совпадении media-query |
| `client:only="<framework>"` | без SSR (учитывать fallback) |

**В публичном слое** (`src/pages/[locale]/*.astro`,
`src/components/public/**`) ни одна `client:*` директива не
используется — только Astro-рендер + vanilla `<script>` + CSS.

## Доступ к биндингам Cloudflare

В SSR-страницах и API-эндпоинтах:

```ts
// src/pages/api/example.ts
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  // env.DB / env.KV_SESSIONS / env.MASTER_SECRET / ...
};
```

Тип `locals.runtime.env` приходит из `worker-configuration.d.ts`,
который генерируется командой `wrangler types`. После любой правки
`wrangler.toml` — перегенерировать.

В клиентских компонентах (островах) биндинги недоступны. Получать
данные через `fetch('/api/...')`.

## env.d.ts

```ts
/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    // дополнительные локали из middleware (user, session, etc.)
  }
}
```

`Env` — глобальный интерфейс из `worker-configuration.d.ts`.

## Middleware

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  // auth-guard для ЛК ([locale]/dashboard/**) и админки (/admin/**)
  const isDashboard = /^\/[a-z]{2}\/dashboard(\/|$)/.test(path);
  const isAdmin = path.startsWith("/admin");
  if (isDashboard || isAdmin) {
    // проверка сессии через ctx.locals.runtime.env (D1 auth_sessions)
    // дополнительно для /admin: users.role === 'admin'
  }
  return next();
});
```

## Pitfalls

1. **`client:only` без fallback** — компонент не рендерится на
   сервере, и без `<Fallback />` пользователь видит пусто до
   гидрации. Указывать fallback явно.
2. **Импорт серверного модуля в островной компонент** — приведёт к
   попытке выполнить серверный код на клиенте. Если нужен серверный
   импорт — делить файл (`*.client.ts` / `*.server.ts`) или выносить
   логику в API-эндпоинт.
3. **`process.env`** — недоступен в Workers runtime. Используй
   `Astro.locals.runtime.env`.
4. **Build-time vs runtime** — `astro.config.mjs` исполняется на
   Node (build-time), `src/**` — на workerd (runtime).

## Команды

```bash
pnpm dev        # astro dev (с platformProxy → биндинги доступны)
pnpm build      # astro build
pnpm preview    # astro preview (локально через wrangler)
```

Подробности по wrangler — в `skills/wrangler/SKILL.md`.
