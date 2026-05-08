# Roadmap (moirai)

Высокоуровневые этапы становления проекта. Детализация — в
`plans/active/` по мере захода в каждый блок.

## M0. Скаффолд

- [ ] Установить git-хуки: `bash scripts/git-hooks/install.sh`.
- [ ] `npm create astro@latest` под minimal/typescript template.
- [ ] Поставить `@astrojs/cloudflare`, прописать adapter в
      `astro.config.mjs`.
- [ ] Зафиксировать `output` (`server` / `hybrid`) в
      `decisions.md`.
- [ ] Стартовый `wrangler.toml` с `pages_build_output_dir`.
- [ ] `npm run lint` / `npm run typecheck` / `npm run build`
      проходят на пустом скелете.
- [ ] `npx wrangler pages dev` запускает локальный dev.

## M1. Структура слоёв

- [ ] Каркас директорий: `src/{pages,components,layouts}/{public,app}/`,
      `src/lib/{server,shared}/`, `src/middleware.ts`.
- [ ] Layout публичного слоя (без JS).
- [ ] Layout защищённой зоны (с островной точкой для Vidstack).
- [ ] `env.d.ts` + первый прогон `wrangler types`.

## M2. Публичный слой

- [ ] Главная страница с SEO-метатегами (`title`, `description`,
      OG, JSON-LD).
- [ ] Базовая навигация, без `client:*`.
- [ ] CSS-only анимации ключевых элементов.
- [ ] Lighthouse SEO / Performance проверены вручную.

## M3. Защищённая зона + Vidstack

- [ ] Auth-flow: middleware + страница логина + сессия в KV
      (или альтернативное хранилище — фиксируется решением).
- [ ] Один endpoint `src/pages/api/...` с биндингами.
- [ ] Vidstack-плеер на странице ЛК как остров.
- [ ] Доступ к закрытой странице без сессии корректно
      редиректит / возвращает 401.

## M4. Деплой

- [ ] Cloudflare Pages-проект создан.
- [ ] Production-секреты прокинуты `wrangler pages secret put`.
- [ ] Первый production-деплой проходит.
- [ ] Preview-деплой на feature-ветку работает.

## M5. Качество и e2e

- [ ] ESLint flat config с `eslint-plugin-astro`.
- [ ] `tsconfig.eslint.json` в корне (см. `skills/js-ts/lint.md`)
      — отдельный конфиг для type-aware линта серверного кода.
- [ ] (опц.) Vitest + workers-pool для серверного кода.
- [ ] Playwright smoke-тесты против `wrangler pages dev`.
- [ ] CI (отдельным решением): запуск lint/typecheck/build.

## Открытые вопросы

- `plans/active/*` (старые factory-планы) — удалить или перенести
  в архив?
- Использовать ли D1 / KV / R2 на старте, или поднимать
  пустой каркас без хранилищ?
- Один Pages-проект на всю moirai или отдельные для public и app?
