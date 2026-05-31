# Active plans — roadmap (2026-05-21)

Текущее состояние active планов + что фактически в проде. Sprint 0
наследие + Sprint 1 текущее.

## Закрыто на проде (за пределами этих планов)

| Что | Стадия |
|---|---|
| Auth flow + multi-method (password / Google / Discord) | stage19 ✅ |
| Admin panel + multi-role users + audit | stage21 ✅ |
| Dashboard scaffold | stage20 ✅ |
| **Apply flow MVP** (slot picker → contact → checkout → mock provider → enrollment) | **stage14 ✅** |
| **R2 + 48 student_book drafts + D1↔R2 validator** | **stage22 ✅** |
| **Student ЛК** (modules grid + R2 body + markdown render + progress + sequential unlock + Mark complete) | **stage26 ✅** |
| Home page Schema.org (Org / FAQ / Course / Person) | stage6 ✅ |
| PSI: 100/100/100 desktop · 96-99/100/100 mobile (SEO 92 cosmetic) | stage8 ✅ |
| Translation-pair validator (`pnpm check:translations`) | stage7c ✅ |
| Programmes + Instructors collections + carts | stage9 ✅ |
| Announcement bar + Stats banner + slim AI module | stage24 ✅ |
| Home banners refactor → ZoneNav shared component | (stage21 follow-up) ✅ |

## Открыто — Active планы

### stage10 — Light theme infrastructure

**Статус:** не начат. Tokens.css содержит только dark, `data-theme="light"`
селектор не объявлен.

**Когда нужен:** Когда появятся длинные читаемые регионы (journal posts,
module body pages с большим объёмом текста). Сейчас module body уже
рендерится через marked на дашборде — это первый кандидат для светлой
темы. Можно triger'нуть после первой реальной правки тела модуля
методистом (когда станет ясно сколько текста в типичном модуле).

**Приоритет:** низкий. UX-улучшение, не блокирует продажи.

### stage15 — Static placeholder pages — **частично закрыт**

| Подэтап | Статус |
|---|---|
| `/[locale]/faq` standalone page | ✅ задеплоено (через stage15 follow-up) |
| `/[locale]/legal/privacy` | ✅ задеплоено (stage14 prep, DRAFT bodies) |
| `/[locale]/legal/terms` | ✅ задеплоено (DRAFT) |
| `/[locale]/legal/refund` | ✅ задеплоено (3 окна FLOW-9a) |
| `/[locale]/legal/cookies` | ✅ задеплоено (DRAFT) |
| `/[locale]/contact` | ❌ не сделан (ждёт данных: email, форма?) |

**Что осталось:** `/contact` page. Минимум — mailto + соц.ссылки + lede.
Если форма — нужен endpoint + Turnstile + rate-limit + Resend для
forwarding на support inbox.

**Приоритет:** средний. Footer-link сейчас 404. Можно сделать stub
с `<a href="mailto:hello@moiraionline.pro">` если форма не нужна.

### stage16 — Collection index pages (works / journal)

**Статус:** не начат.

| Подэтап | Готовность |
|---|---|
| `src/content/works/` коллекция | ⏳ пуст (студенческие фильмы появятся после 1й cohort'ы) |
| `src/content/journal/` коллекция | ⏳ пуст (блог-pipeline не настроен) |
| `/[locale]/works` listing | ❌ |
| `/[locale]/journal` listing | ❌ |
| `/[locale]/works/[slug]` detail | ❌ |
| `/[locale]/journal/[slug]` detail | ❌ |

**Приоритет:** низкий до появления контента. Footer ссылки 404; можно
временно удалить эти строки из Footer чтобы Lighthouse не флагал.

### stage25 — Mobile design pass — **deferred**

**Статус:** план зафиксирован 2026-05-21, deferred после Student ЛК.

Конкретные жалобы (lottoprof):
1. AnnouncementBar — "мешанина из букв" на mobile
2. StatsBanner — "Готовый короткометражный" wraps, ячейки разной высоты

Plus checklist 16 других mobile-issues для прохода через 375px viewport.

**Приоритет:** высокий **после** реального тестирования Student ЛК
методистом и первой когортой. Эстетика без боли пользователей — не
блокирует.

## Что точно следующее (Sprint 1 / 2)

Sprint 1 продолжение:
- [ ] `/contact` page (stage15 tail) — лёгкий quick win
- [ ] Удалить broken footer links (works/journal) до их реализации —
  предотвращает 404 на live-сайте
- [ ] **Mobile design pass** (stage25) — после реального теста ЛК
- [ ] Light theme infrastructure (stage10) — после длинного тела модуля

Sprint 2 (новые планы будут):
- [ ] **Announcements: Content Collection → D1 + admin UI**. Сейчас
  `src/content/announcements/*.{en,ru}.mdx` правится в репо (методист
  не имеет UI). План: миграция в D1 table `announcements` (поля те же:
  kind, text, cta_*, starts_at, ends_at, priority, dismissible, locale,
  monolingual), admin CRUD `/admin/announcements`, API
  `/api/admin/announcements/*`. PromoStrip и AnnouncementBar читают из
  D1 вместо collection. Эстимейт: ~1 день.
- [ ] **Real LemonSqueezy adapter** — заменить mock provider после approval
- [ ] **Stage 14 deferred items**:
  - Admin /applications drawer с audit-timeline + row actions (transfer/cancel)
  - Bulk operations + CSV export
  - Pagination
- [ ] **External repo `moirai-content`** + GH Actions sync
- [ ] **Homework submission UI** (Student ЛК continuation)
- [ ] **Live session player** (Vidstack) когда первая cohort стартует
- [ ] **CF Cron Trigger** для daily `/api/admin/cron/tick` automation
- [ ] **PersonSchema** для instructor detail pages когда сделаем `/instructors/[slug]`
- [ ] **BreadcrumbList Schema** для `/journal/<slug>`, `/works/<slug>`,
  `/legal/<id>`, `/programmes/<id>`. Deferred: Google в 2024-2026 показывает
  breadcrumbs в SERP всё реже, наши URL уже короткие. Триггер для реализации —
  (а) первый реальный трафик в Search Console с CTR-проблемой на детальных
  страницах, либо (б) делаем `/programmes/<id>` детальные — тогда сразу
  компонент для всех 4 типов. См. `docs/seo-markup-rules.md §5`.
- [ ] **Real instructor bios** (Vladimir + Anastasia подменят DRAFT текст
  на full ~100-word био — source: пример клиента Film_Site_6.html.
  Vladimir: TV/радио в подростковом возрасте → film degree → feature-length
  grad project снят за shoestring → music videos + commercial production →
  US teaching. Anastasia: film degree → 1st AD on TV series/shorts/
  commercials → стала directing → festival placements → специализация
  director's script + actor psychology → US teaching film + theater.
  Эти long bios идут в /instructors/[slug] detail pages, не на home.
  Home `bio_short` = 15-30 слов per voice-guide §"Длина текстов").
- [ ] **Hero cohort urgency — SSG injection из D1** (booking-pattern). Sprint 1
  пока статика в `home.{en,ru}.mdx` frontmatter (методист правит руками при
  смене даты). Sprint 2 — pre-build скрипт `scripts/sync-hero-cohort.mjs`:
  query D1 `SELECT * FROM cohorts WHERE start_date >= now ORDER BY start_date LIMIT 1`,
  write to `src/generated/hero-cohort.json` (commit'ится), Hero.astro импортит
  и рендерит если есть данные. Хук в `package.json` `prerelease` — авто-запуск
  перед `pnpm release`. Аналог booking `backend/app/services/ssg/render_promo.py`.

## Documentation / Skills updates

- ✅ `docs/methodist-modules-guide.md` — полный workflow (regen / upload /
  R2 keys / Sprint 2 roadmap)
- ✅ `docs/apply-flow-spec.md` — спека Apply flow (FLOW-1..31)
- ✅ `.agent/skills/common/git.md` — GitHub SSH alias `github-lottoprof`
- ⏳ `docs/student-lk-spec.md` — нет; Student ЛК пока без формальной спеки
  (но stage26 plan покрывает что сделано)
