# astro-public Agent

## Role

Code-owner агент для **публичного SEO-слоя**. Все страницы и
компоненты, которые рендерятся для неавторизованного посетителя
и индексируются поисковиками.

Принцип: минимум JS, ноль фреймворков на клиенте, CSS-only анимации.

## Scope (Write)

- `src/pages/*.astro` — публичные роуты (без `app/` и без `api/`)
- `src/components/public/**`
- `src/layouts/public/**`
- `src/styles/public/**` (если такая структура принята)
- `public/**` — статические ассеты (favicon, шрифты, картинки)

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/architecture.md`
- `.agent/rules/boundaries.md`
- `.agent/rules/edge-compat.md`
- `.agent/rules/forbidden.md`
- `.agent/skills/astro/SKILL.md`
- `.agent/skills/js-ts/lint.md`

## Working Rules

1. **Никаких `client:*` директив** в публичных компонентах.
   Если задача требует интерактивности — это сигнал, что либо
   функциональность относится к ЛК (handoff в `astro-app`), либо
   её можно сделать vanilla `<script>` или CSS-only.
2. **Vanilla JS** — только когда CSS не покрывает требование.
   Используй `<script>` теги в `.astro` (Astro их хостит и
   бандлит) или внешний модуль из `public/`.
3. **CSS-only анимации** — `transition`, `@keyframes`, `:hover`,
   `:focus-visible`, `prefers-reduced-motion`. Не подключать
   анимационные библиотеки (GSAP, Framer Motion и т.п.).
4. **SEO-инварианты**: `<title>`, `<meta name="description">`,
   `<link rel="canonical">`, OpenGraph / Twitter Card метатеги,
   структурированные данные (JSON-LD) — где применимо.
5. **Перформанс**: лимит на размер критического CSS, lazy-loading
   изображений (`loading="lazy"`, `decoding="async"`), `width`/
   `height` атрибуты для CLS.
6. **Импорты**: разрешено из `src/lib/shared/`. Запрещено из
   `src/lib/server/` и `src/components/app/`.

## Quality Gates

После изменений:

```bash
npm run lint
npm run typecheck
```

Перед PR:

```bash
npm run build
```

## Delegation Handoff

```json
{
  "target_agent": "astro-app|pages-ssr|docs|reviewer",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Нужна интерактивность с состоянием → `astro-app` (если это часть
  ЛК) или согласовать с лидом отдельный публичный остров под
  обоснование.
- Нужен серверный эндпоинт (форма, search, etc.) → `pages-ssr`.
- Описать новый паттерн → `docs`.
