# Edge Compatibility (Cloudflare Workers runtime)

Весь runtime-код, попадающий в Worker через `@astrojs/cloudflare`,
обязан быть Edge-совместимым.

## Зоны действия

- **Runtime (Edge)** — `src/pages/**`, `src/components/**` (server
  parts), `src/lib/server/**`, `src/lib/shared/**`, `src/middleware.ts`.
- **Build-time (Node)** — `astro.config.mjs`, integrations,
  build scripts. Здесь Node API разрешены.

Если сомневаешься — считай код runtime'ом.

## Запрещено в runtime

- Node API: `fs`, `path`, `process`, `child_process`, `os`, `net`,
  `http`, `https`, `stream`.
- Node `crypto` модуль.
- `Buffer` (без явного polyfill).
- `__dirname`, `__filename`.
- Динамический `require()`.
- Зависимости, которые внутри тянут любое из перечисленного.

## Разрешено

- `crypto.subtle` (Web Crypto API).
- `fetch`, `Request`, `Response`, `URL`, `URLSearchParams`.
- `TextEncoder` / `TextDecoder`.
- `crypto.getRandomValues`.
- Edge-совместимые npm-пакеты (явный признак: `"workerd"`,
  `"edge-light"` или `"worker"` в `exports` / `engines`, либо
  заявленная Edge-совместимость).

## Биндинги

- Доступ только через `Astro.locals.runtime.env.<NAME>`.
- Типы — из `worker-configuration.d.ts` (генерируется `wrangler
  types`). Не править руками.
- Никаких `process.env.<NAME>` в runtime — это Node-only.

## Проверки

- При появлении нового пакета — проверить совместимость до
  установки.
- Reviewer-агент проверяет edge-compat в финальном проходе.
- Build падает в проде — значит, что-то Node-only попало в
  runtime. Чинить, не глуша.
