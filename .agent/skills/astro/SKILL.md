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
│   ├── index.astro              # публичный landing
│   ├── *.astro                  # публичные SEO-страницы
│   ├── app/
│   │   ├── index.astro          # ЛК — главная
│   │   └── ...                  # защищённые страницы
│   └── api/
│       └── <route>.ts           # серверные эндпоинты
├── components/
│   ├── public/                  # vanilla, CSS-only
│   └── app/                     # islands, Vidstack
├── layouts/
│   ├── public/
│   └── app/
├── lib/
│   ├── server/                  # edge-only код
│   └── shared/                  # изоморфные утилиты
├── middleware.ts                # auth/ratelimit на границе app
├── styles/
└── env.d.ts                     # типы биндингов + Astro.locals
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
| `client:idle` | по умолчанию для большинства островов в `app/` |
| `client:visible` | компонент гидрируется при скролле в viewport |
| `client:media="(...)"` | гидрация при совпадении media-query |
| `client:only="<framework>"` | без SSR (учитывать fallback) |

**В публичном слое** (`src/pages/*.astro`, `src/components/public/**`)
ни одна `client:*` директива не используется — только Astro-рендер +
vanilla `<script>` + CSS.

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
  // auth-guard для /app/**
  if (ctx.url.pathname.startsWith("/app")) {
    // проверка сессии через ctx.locals.runtime.env.KV_SESSIONS
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
