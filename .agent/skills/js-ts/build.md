# js-ts: build

Astro билдится через `astro build`. Под капотом — Vite. Для
moirai цель сборки — `dist/`, формат адаптера —
`@astrojs/cloudflare`.

## Команды

```bash
pnpm build      # astro build
pnpm preview    # astro preview (локально, через wrangler)
```

`pnpm build` обычно настроен как:

```json
"build": "astro build"
```

## Что обязательно проверить перед build

1. `wrangler.toml` соответствует биндингам, которые код реально
   использует. Если добавили новый биндинг — `pnpm exec wrangler types`
   должен пройти до `astro build`, иначе типы не подхватятся.
2. `astro.config.mjs` указывает adapter `@astrojs/cloudflare`.
3. `package.json` содержит зависимости от `astro` и
   `@astrojs/cloudflare` совместимых версий.

## Артефакты

- `dist/` — статика + Worker bundle для Pages.
- `.astro/` — кэш Astro (gitignored).
- `worker-configuration.d.ts` — генерируется `wrangler types`.

## Pitfalls

1. **Build падает на «Cannot use … in workerd»** — попал Node API
   в runtime. Найти импорт через stack trace, заменить на Web API
   или вынести в build-time скрипт.
2. **`output: "static"`** случайно — SSR-страницы не будут работать
   в проде. Должно быть `"server"` или `"hybrid"` (см.
   `decisions.md`).
3. **Тяжёлая зависимость в публичной странице** — Astro инлайнит
   только реально использованный JS, но импорт «по ошибке» в
   layout может раздуть bundle. Проверять размер `dist/_astro/*.js`.

См. также `skills/wrangler/SKILL.md` (раздел Pages deploy) и
`skills/deploy/SKILL.md`.
