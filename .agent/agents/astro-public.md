# astro-public Agent

## Role

Code-owner агент для **публичного SEO-слоя**. Все страницы и
компоненты, которые рендерятся для неавторизованного посетителя
и индексируются поисковиками.

Принцип: минимум JS, ноль фреймворков на клиенте, CSS-only анимации.

## Scope (Write)

- `src/pages/[locale]/*.astro` — публичные SEO-роуты (без
  `dashboard/`, без `admin/`, без `api/`)
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
   функциональность относится к ЛК (handoff в `astro-dashboard`),
   либо её можно сделать vanilla `<script>` или CSS-only.
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
   `src/lib/server/`, `src/components/dashboard/`,
   `src/components/admin/`.
7. **Anti-hardcode.** Цены, длительности, имена программ, лимиты —
   только через Content Collections / `<Fact />`-компонент / API.
   См. `forbidden.md` §Anti-hardcode.

## Quality Gates

После изменений:

```bash
pnpm lint
pnpm typecheck
```

Перед PR:

```bash
pnpm build
```

## Delegation Handoff

```json
{
  "target_agent": "astro-dashboard|astro-admin|content|pages-ssr|schema|docs|reviewer|e2e",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

Случаи handoff:

- Нужна интерактивность со state / медиа → `astro-dashboard` (если
  часть ЛК) или согласовать с лидом отдельный публичный остров.
- Нужен серверный эндпоинт (форма apply, search, MoR webhook,
  media gate) → `pages-ssr`.
- Правка тира программы / bundle / переводов / journal → `content`.
- Описать новый паттерн → `docs`.
