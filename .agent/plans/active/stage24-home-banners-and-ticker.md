# Stage 24 — Home: announcement bar, stats-ticker, AI slim banner

## Контекст

Главная (`/`) сейчас имеет два визуальных слабых места:

1. **Ticker** — декоративная бегущая строка дисциплин под Hero,
   мелкий italic text-faint, `aria-hidden`. Без информационной
   ценности.
2. **AI module** — большая центральная card-секция "Filmmaking with AI"
   (~30vh), занимает столько же места сколько полноценная программа,
   хотя это _анонс_.

И отсутствует **announcement bar** — нет стандартного места для
сообщений типа "Скоро", "Новинка", "Акция", "Когорта стартует", которые
обычно бегут поверх всей навигации.

Stage 24 решает эти три задачи + параметризует pre-footer CTA.

## Цели

1. **Ticker → stats-banner.** Заменить контент с дисциплин на конкретику
   что получает студент: "10 students max", "2 sessions/week",
   "Personal review", "Finished short film".
2. **AI module → slim banner.** Конвертировать большую секцию в тонкий
   announcement-style баннер (~96px высоты, amber-strip border).
3. **Top announcement bar.** Новый компонент над `<Nav>` (non-sticky),
   данные из content collection `announcements`. Поддерживает типы:
   `soon` / `new` / `promo` / `cohort` / `info`.
4. **Pre-footer CTA banner — НЕ делаем.** FinalCta-секция уже играет
   эту роль; второй banner = CTA fatigue. Если позже понадобится —
   отдельным stage'ом.

## Типы announcement-сообщений

| kind | Префикс EN / RU | Цвет / визуал |
|---|---|---|
| `soon` | Coming soon / Скоро | амбер мягкий (amber-faint background) |
| `new` | New / Новинка | амбер яркий (filled amber) |
| `promo` | Promo / Акция | амбер + subtle pulse animation |
| `cohort` | Cohort / Когорта | text-accent на нейтральном фоне |
| `info` | Info / Инфо | text-faint, минимально заметный |

## Где хранятся announcements

Content Collection `announcements` (`src/content/announcements/`).
Файлы `<slug>.{en,ru}.mdx`, frontmatter содержит все поля:

```yaml
title: "ai-module-soon"           # внутренний slug, не показывается
kind: "soon"                       # см. типы выше
text: "Filmmaking with AI — coming this autumn"
cta_text: "Join the waitlist"     # опционально
cta_href: "/en/ai-module-waitlist" # опционально
starts_at: 2026-05-20              # автопубликация
ends_at: 2026-09-30                # автоистечение
priority: 5                        # 0–10, выше = чаще ротация
dismissible: true                  # пользователь может скрыть на 7d
```

Markdown body не используется (один `text` достаточно).

## Где рендерится announcement bar

- ✅ Главная `/[locale]/`
- ✅ Programme detail pages `/[locale]/programmes/[id]`
- ✅ Static pages (faq, legal/*)
- ❌ Login / Register / Apply (отвлекает от формы)
- ❌ Admin / Instructor / Dashboard (не маркетинговые зоны)

Подключается в `src/layouts/public/Layout.astro` под `<head>`, сразу
над `<Nav>`. Не на protected layouts.

## Lifecycle сообщений

- Активные определяются на сервере: `starts_at ≤ now ≤ ends_at`
- SSG страницы обновляют announcements при следующем деплое
  (приемлемо для типа Скоро/Новинка)
- Сортировка: по `priority` desc, потом по `starts_at` asc
- Если активных > 1 — ротация на клиенте каждые 7 сек (CSS opacity transitions)
- `dismissible: true` → крестик справа; cookie `moirai_announce_dismissed`
  с массивом slug'ов, TTL 7d

## Файлы для создания / изменения

**Создать:**
- `src/content/announcements/` — новая директория
- `src/content/announcements/ai-module-soon.{en,ru}.mdx` — demo
- `src/content/announcements/early-cohort.{en,ru}.mdx` — demo
- `src/components/public/AnnouncementBar.astro` — компонент + JS ротация + dismiss

**Модифицировать:**
- `src/content/config.ts` — добавить `announcements` коллекцию (zod schema)
- `src/components/public/Ticker.astro` — переписать на stats-banner; новые props (`items: { label, value, accent? }[]`) либо заменить совсем новым компонентом `<StatsBanner />`
- `src/components/public/AiModule.astro` — конвертировать в slim banner (~96px, амбер-strip border, CTA inline справа)
- `src/pages/[locale]/index.astro` — обновить вызовы Ticker/AiModule, передать новые данные; убрать ticker.items из home.{en,ru}.mdx или конвертировать в stats
- `src/content/pages/home.{en,ru}.mdx` — `sections.ticker.items` → `sections.stats.items[]` (label + value)
- `src/layouts/public/Layout.astro` — `<AnnouncementBar />` над `<Nav>` (только public layout)

## Чеклист

- [ ] **24a** — content collection `announcements` + zod schema
- [ ] **24b** — 2 demo announcements (AI soon / early cohort) в обе локали
- [ ] **24c** — `<AnnouncementBar />` компонент (рендер + ротация JS + dismiss-cookie)
- [ ] **24d** — Layout: AnnouncementBar над Nav на public страницах
- [ ] **24e** — `<StatsBanner />` компонент (заменяет Ticker)
- [ ] **24f** — `home.{en,ru}.mdx`: `sections.ticker` → `sections.stats` с конкретикой
- [ ] **24g** — `index.astro` использует StatsBanner вместо Ticker
- [ ] **24h** — `<AiModule />` → slim banner (96px, inline CTA)
- [ ] **24i** — `pnpm lint && typecheck && build` зелёные
- [ ] **24j** — local preview: главная во всех 3 viewport'ах (mobile/tablet/desktop)
- [ ] **24k** — production deploy + smoke
- [ ] **24l** — план → `done/`

## Не входит в Stage 24 (out of scope)

- **Admin UI для управления announcements** — потом, через
  `/admin/announcements` (Sprint 2). Сейчас правка через git → PR → deploy
- **A/B testing** формулировок — нет инфраструктуры
- **Click-through analytics** — пока нет аналитики на сайте
- **Sticky-on-scroll** announcement bar — оставляем non-sticky,
  не отнимает viewport на длинных страницах
- **Pre-footer CTA banner** — FinalCta уже играет роль, дублирование
  даёт CTA fatigue
- **Полностью удалить старый Ticker** компонент — оставляем файл для
  возможного reuse в других местах (например в /journal); просто
  не подключаем на главной

## Critical files

- `src/content/config.ts` — schema
- `src/content/announcements/*.mdx` — источник данных
- `src/components/public/AnnouncementBar.astro` — клиентская ротация
- `src/components/public/StatsBanner.astro` — замена Ticker
- `src/components/public/AiModule.astro` — конверсия в slim
- `src/layouts/public/Layout.astro` — точка подключения AnnouncementBar
- `src/pages/[locale]/index.astro` + `src/content/pages/home.{en,ru}.mdx` — переход с Ticker на Stats

## Verification

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

Local preview через `wrangler pages dev dist`:

1. `/en/` — наверху виден AnnouncementBar; ниже Hero; ниже Stats-banner вместо ticker'а; AI module стал тонкой полоской
2. `/ru/` — то же с русскими строками
3. Mobile (375px) — AnnouncementBar wrap'ится, stats-banner stack в 2×2 или 1×4
4. `prefers-reduced-motion: reduce` — ротация AnnouncementBar остановлена, dismiss работает
5. `/en/login` — AnnouncementBar **не** показывается
6. `/admin/` — AnnouncementBar **не** показывается

## Reference

- `docs/moirai-home.html` — исходный design system (если есть announcement-pattern)
- decisions_archive — на момент Stage 24 нет специфичных решений по announcements
