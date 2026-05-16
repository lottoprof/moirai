# Sprint 0 Stage 20 — Dashboard stub (mockup parity)

## Context

После Stage 19 (auth flow) `/{locale}/dashboard` существует, но это
минимальная заглушка с приветствием и списком "скоро здесь". В
`docs/moirai_dashboard_mockup.html` лежит дизайн-mockup overview-страницы
с реальной графической плотностью: hero greeting → stats row (progress
3/12, tier, homework count) → "Continue learning" amber card → modules
grid (done/active/locked состояния) → homework list (UNDER REVIEW /
SUBMIT badges).

Цель Stage 20 — поднять production-look `/{locale}/dashboard` до
mockup-уровня **со stub-данными**. Реальные D1-таблицы (enrollments,
modules, module_progress, homework_submissions) появятся в Sprint 1.
Сейчас все цифры/модули/задания захардкожены во frontmatter с явным
маркером `// STUB:` в коде, чтобы Sprint 1 знал что мигрировать.

Архитектурно (см. decisions 2026-05-16): dashboard — Astro MPA с
per-route SSR. Текущий Stage 20 покрывает только `index.astro`
(overview), per-module страница `[id].astro` — Sprint 1.

Решения, на которые опирается план:
- `2026-05-16: dashboard routing` — MPA, не SPA, islands per-route
- `2026-05-12: auth model` — `verifyRefreshSession` для guard'а
- `2026-05-08: stack` — Astro 5 + CF Pages + scoped styles + BEM

## Что НЕ входит в Stage 20

- **Per-module страница** `/dashboard/modules/[id].astro` — Sprint 1
- **D1-схема enrollments/modules/homework** — Sprint 1, отдельный
  schema-plan (соответствующий agent — `schema`)
- **Vidstack player интеграция** — Sprint 1 (на странице модуля)
- **Homework upload form** — Sprint 1
- **Instructor view** — отдельная роль, отдельная страница, Sprint 1+
- **View Transitions (`<ClientRouter />`)** — пока одна страница в зоне,
  смысла нет. Добавим когда появится `[id].astro`
- **Real i18n dict** — строки inline до Stage 7 (translation-pair
  validator)

## Этапы

### 20a — DashboardLayout

Новый файл `src/layouts/dashboard/Layout.astro` — отдельный layout для
protected zone. Отличия от `public/Layout.astro`:

- **Без public Nav** (с Sign in/Sign up): dashboard nav — отдельный
  компонент `DashboardNav` с пунктами Dashboard / Modules / Homework /
  Account + sign-out trigger.
- **Без Footer**: dashboard self-contained, без маркетинговых ссылок.
- **noindex по умолчанию** (зашит в layout, отдельный prop не нужен).
- **Импортирует тот же** `tokens.css` / `fonts.css` / `base.css` /
  `utilities.css` (single source of truth для дизайна).
- **Skip link**: остаётся для a11y.

Props: `locale`, `seo` (только `title` + `description`), `currentNavKey`
(для подсветки активного пункта nav).

### 20b — DashboardNav

`src/components/dashboard/DashboardNav.astro`:

- Логотип `MOIRAI.` слева (ссылка на `/{locale}/dashboard`)
- Справа: Dashboard / Modules / Homework / Account →
- Активный пункт — `aria-current="page"` + `.dashboard-nav__link--active`
  (amber color через `--text-accent`)
- Sign out — отдельная кнопка/ссылка в конце? Mockup кладёт sign-out
  на `/account` страницу — оставим так (Account → ведёт на /account
  где уже есть Sign out).
- Семантика: `<nav>` с `<a href>` элементами (не `<div>` + JS).
- Стиль через scoped `<style>` в компоненте.
- Mobile: при `< 640px` пункты nav в одну строку с уменьшенным
  letter-spacing, либо hamburger. Для stub-этапа — **горизонтальный
  scroll** простейший fallback, hamburger отложить.

### 20c — Dashboard overview component pieces

В `src/components/dashboard/` создать переиспользуемые куски:

- `DashboardHero.astro` — eyebrow + большое имя + tier-line
  - Props: `eyebrow: string`, `name: string`, `tierLine: string`
- `StatCard.astro` — одна карточка из stats row
  - Props: `label: string`, `value: string | number`, `valueAccent?: string`,
    `sub: string`, `progress?: number` (0-1) — рисует bar если задан
- `ContinueCard.astro` — большая amber-карточка "Continue learning"
  - Props: `eyebrowText: string` (e.g. "MODULE 04 · DIRECTING"),
    `title: string`, `meta: string`, `href: string`
- `ModuleCard.astro` — карточка модуля в grid
  - Props: `num: string` (e.g. "01"), `track: string` (e.g. "DIRECTING"),
    `title: string`, `status: "done" | "active" | "locked"`,
    `statusLabel: string`, `href: string`
  - locked-карточка — `<div>` с `aria-disabled="true"`, не `<a>`
  - done/active — `<a>` с реальным href (заглушка `#` до Sprint 1)
- `HomeworkCard.astro` — карточка задания
  - Props: `moduleLabel: string`, `title: string`, `badgeLabel: string`,
    `badgeVariant: "pending" | "review"`, `href: string`

Каждый компонент — scoped `<style>` с BEM. Цвета только через токены
(`--text`, `--text-muted`, `--text-faint`, `--text-accent`, `--border`,
`--bg-elevated`, `--amber-faint`).

### 20d — Overview page assembly

Переписать `src/pages/[locale]/dashboard/index.astro`:

- SSR + `verifyRefreshSession` guard (как сейчас)
- `findUserById` — нужен `name` и `email` для greeting
- Frontmatter блок `// STUB: replace with D1 queries in Sprint 1` с
  захардкоженными значениями:
  - `progress = { completed: 3, total: 12 }`
  - `tier = { label: "Beginner Programme", enrolledAt: "2026-05-15" }`
  - `homeworkAwaiting = 1`
  - `continueModule = { num: "04", track: "DIRECTING", title: "Visual Language", meta: "Text + video · homework required" }`
  - `modules = [...6 items с status]`
  - `homework = [...2 items с status]`
- Локализованный date format через `new Intl.DateTimeFormat(locale, { ... })`
- Greeting helper: `firstName = user.name?.trim().split(/\s+/)[0] ?? user.email.split("@")[0]`
  - Если получается длинное (например "lottoprof") — пускай CSS
    `word-break: break-word` сам разбивает; не лепим `<br>` посреди слова
- `?verified=1` toast — оставляем существующую логику
- Layout: новый `DashboardLayout` с `currentNavKey="dashboard"`
- Структура: `<DashboardHero />` → `<section class="stats-row">` с тремя
  `<StatCard>` → `<ContinueCard>` → grid из `<ModuleCard>` → list из
  `<HomeworkCard>`
- Section eyebrows: "CONTINUE LEARNING" / "ALL MODULES" / "HOMEWORK" —
  переиспользуем `.section-label` стиль из base.css если есть, иначе
  локальный класс

### 20e — Responsive + a11y polish

- Mobile (`< 640px`):
  - hero name немного меньше (`clamp(36px, 9vw, 52px)`)
  - stats-row → 1 col stack
  - modules-grid → 1 col
- A11y:
  - module-card `<a>` элементы (не div+cursor)
  - locked-карточки — `aria-disabled="true"` + visually отличаются
    (не через opacity, а через приглушённый цвет + lock-иконка inline
    SVG или unicode 🔒 — но без эмодзи в коде, лучше SVG)
  - `aria-current="page"` на активном nav-пункте
  - `aria-label` на progress-bar или `<progress>` элемент
  - all decorative arrows (→) — `aria-hidden="true"`
- Сравнить контрасты с WCAG AA (4.5:1 для body text, 3:1 для large
  text). Особенно `--text-faint` на тёмном фоне.

### 20f — Lint + typecheck + build

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Любые ошибки — фикс перед коммитом.

### 20g — Local preview

```bash
pnpm exec wrangler pages dev .vercel/output --port=8788
# Или pnpm dev — в зависимости от текущего setup
```

Проверить:
- `/en/dashboard` — рендерится новый layout, всё видно, нет console errors
- `/ru/dashboard` — русские строки на месте, дата отформатирована
  по-русски ("15 мая 2026 г." а не "May 15, 2026")
- Все ссылки работают (а пока ведут на `#`)
- Active nav пункт подсвечен
- Mobile viewport (320-480px) — ничего не разъезжается
- Sign out (через Account) — работает

### 20h — Commit + deploy

Один коммит:

```
dashboard stub: mockup-parity overview (stats / continue / modules / homework)
```

Деплой:

```bash
pnpm exec wrangler pages deploy dist --project-name=moirai
```

Проверить на `https://moiraionline.pro/en/dashboard` залогиненным.

### 20i — План в done

```bash
git mv .agent/plans/active/sprint0-stage20-dashboard-stub.md .agent/plans/done/
git commit -m "plan: stage20 dashboard stub → done"
```

## Risks / edge cases

- **TypeScript strict** — Cloudflare Env type augmentation в `env.d.ts`
  уже покрывает `locals.runtime.env`, новых биндингов не требуется.
- **Existing Layout import** — текущий `dashboard/index.astro` использует
  `public/Layout.astro` который рендерит public Nav (Sign in / Sign up).
  После переключения на `DashboardLayout` — это ломается, нужен полный
  swap. Не оставлять "переходный" режим.
- **Sign-out flow** — сейчас работает через `.js-signout` на странице
  dashboard. После переписывания этой страницы — sign-out перемещается
  на `/account`. Проверить что `/account` имеет sign-out кнопку
  (по логам — да, имеет).
- **`docs/moirai_dashboard_mockup.html`** — untracked файл. Решить:
  - (a) добавить в git (`docs/` уже трекается) как reference,
  - (b) оставить untracked / удалить после реализации.
  Рекомендую (a) — пригодится при ревью Sprint 1 для сравнения.

## Готовность

- [ ] 20a DashboardLayout
- [ ] 20b DashboardNav
- [ ] 20c component pieces (5 файлов)
- [ ] 20d overview page assembly
- [ ] 20e responsive + a11y
- [ ] 20f lint/typecheck/build clean
- [ ] 20g local preview verified
- [ ] 20h commit + deploy to prod
- [ ] 20i plan → done
