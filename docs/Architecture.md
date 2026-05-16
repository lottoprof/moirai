# Moirai — Architecture v0.8.3

> **Status:** working draft. Зафиксированы: технологический стек, локализация
> через path-prefix, архитектура контента, модель программ и запусков
> (модуль как атомарная единица, гибкая связь сессий с модулями и студентами,
> групповые работы, **тиры как прайс-структура, bundles как пакеты программ**),
> структура сайта, хранение медиа, плеер, схема D1 (17 таблиц), soft
> constraints на ресурсы, agent-driven workflow, локальная разработка,
> админ-панель, **промо-коды и реферальная система**.
>
> **Принцип:** архитектура описывает свойства платформы. Конкретные числа,
> имена, программы, локали — это **данные**, живут в Content Collections /
> D1 / KV / `astro.config.mjs`, а не в архитектурном тексте.
>
> Не зафиксировано: детализация типов/индексов/FK в D1, доработка users
> до полноценной auth, выбор MoR и webhook-логика, имплементация agent
> pipeline, формальная шкала оценок, конкретные resource types.

---

## 1. Контекст

**Продукт:** Moirai — онлайн-платформа структурированного обучения
кинорежиссуре. Брендовое имя проекта.

**Что система делает (свойства платформы):**

- Каталог учебных программ, каждая — последовательность модулей с
  педагогическими атрибутами
- Каждая программа имеет **несколько тиров** (вариантов покупки) с разными
  ценами и наборами фич — посетитель видит прайс-лист до регистрации
- Платформа поддерживает **bundles** — пакеты из нескольких программ,
  продаются как самостоятельный продукт со своей ценой и тирами
- Запуск программы (`run`) — материализация каталога во времени с датами,
  выбранным тиром, ценой, набором участников
- Студент покупает место в конкретном запуске (или bundle, тогда сразу
  в нескольких runs), проходит модули по расписанию, сдаёт работы
- Сессии студент-преподаватель: индивидуальные или групповые
- Работы студентов: индивидуальные или групповые (общий `group_id`)
- Персональный фидбэк и оценки **всегда per-student**
- Многоязычная подача через path-prefix URL-локализацию
- Несколько инструкторов с настраиваемыми ёмкостями нагрузки
- Промо-коды и реферальная система с единой аналитикой
- Soft constraints на любые ресурсы платформы (см. §10)

**Что система НЕ делает:**

- ❌ Не предоставляет встроенный групповой чат / мессенджер. Внешние
  инструменты, если студенты хотят общаться.
- ❌ Self-paced без рамок. У запуска есть начало, реперные точки и конец.
- ❌ Подписку. Только разовая покупка пакета (run или bundle).
- ❌ AI-инструменты как продукт. Агенты — это infrastructure, не feature
  для студента (см. §11).

**Текущая конфигурация — НЕ часть архитектуры.** Конкретные программы,
тиры, инструкторы, локали, цены, промо-коды, ресурсные лимиты — это данные:

- Программы и каталог модулей — Content Collections + D1 (см. §4)
- Тиры программ и bundles — Content Collections (см. §5, §4)
- Инструкторы — записи в `users` с `role='instructor'`
- Локали — `astro.config.mjs`
- Цены конкретных runs — поле `runs.price_amount` (snapshot из tier)
- Промо-коды — таблица `promo_codes`
- Resource caps — таблица `resources`

Любые числа в этой архитектуре — иллюстративные, не нормативные.

---

## 2. Технологический стек

### Frontend / Hosting

- **Astro 5** (Vite + TypeScript под капотом) — публичный SEO-слой и SSR-страницы
- **Cloudflare Pages** — деплой статики и SSR через CF Workers (адаптер `@astrojs/cloudflare`)
- **Vidstack** — медиаплеер для ЛК (островная гидрация в защищённой зоне)
- Vanilla JS + CSS-only анимации в публичном слое

### Backend / Edge

- **Cloudflare Workers** — все API-роуты, бизнес-логика, gatekeeping медиа,
  валидация промо-кодов и реферальной логики
- **Cloudflare D1** — реляционная БД для образовательного ядра, операций,
  resource caps, промо, рефералов
- **D1 нативно** — SQL-миграции в `migrations/`, применяются через
  `wrangler d1 migrations`. Запросы — через Worker binding
  `env.DB.prepare(...).bind(...)`. TypeScript-типы пишутся вручную
  рядом с миграциями. **Без ORM.**
- **Cloudflare KV** — глобальные настройки сайта (см. §13)
- **Cloudflare R2** — объектное хранилище для медиа и тел приватного контента
- **aws4fetch** — генерация presigned URL для R2
- **Zod** — валидация runtime API-входа (формы, JSON body, query params,
  webhook payloads). Не про БД — про data в момент входа в систему.

### Внешние сервисы

- **Resend** — transactional email
- **Merchant of Record** — приём платежей `[TBD-3]`. **Промо применяется
  на нашей стороне** (Worker считает финальную сумму, передаёт в MoR).
  Это даёт единую аналитику по campaign и независимость от выбора MoR.

### Dev infrastructure (НЕ часть продукта)

- **Claude Code / Codex CLI** — agent-driven content production
- **MCP servers** — filesystem, git, опционально search
- **GitHub** или self-hosted git — version control + CI/CD триггер

### Что **не** используем и почему

- ❌ **Cloudflare Stream** — free tier CF + R2 + presigned URL покрывает требования
- ❌ **Stripe (прямой)** на старте; MoR покрывает через посредника
- ❌ **Postgres / отдельный DB-хост** — D1 покрывает потребности
- ❌ **Поддомены или отдельные домены для языков** — раздваивает SEO-вес
- ❌ **Zoom API / автоматизация Zoom-ссылок** — выдаются вручную
- ❌ **Headless CMS** — D1+R2 для приватного, Content Collections для публичного
- ❌ **MoR-native промо-коды** — промо в нашей системе, MoR получает
  конечную сумму

---

## 3. Локализация

### URL-структура (path-prefix, prefixDefaultLocale: true)

Один домен. Язык — **первый сегмент** сразу после домена, далее обычный
путь страницы. Префикс обязателен для всех языков:

```
moirai.film/{locale}/                    → home
moirai.film/{locale}/beginner            → программа
moirai.film/{locale}/journal/post-slug   → пост
moirai.film/                             → редирект по Accept-Language
```

Платформа поддерживает произвольное количество локалей, список — в
`astro.config.mjs`.

### Role-zones (auth required)

После Stage 21 платформа делится на **четыре** зоны по ролям пользователя:

```
/[locale]/dashboard/**     — Student ЛК   (role: 'student')
/[locale]/instructor/**    — Instructor   (role: 'instructor')
/admin/**                  — Admin panel  (role: 'admin', без локали)
/[locale]/account          — Cross-zone   (любая аутентификация)
```

- Каждая зона — собственный layout (`src/layouts/{dashboard,instructor,admin}/`)
  и Nav-component.
- Guards: `requireRole(ctx, role)` в frontmatter каждой страницы;
  возвращает 404 (info-hiding) при несовпадении или redirect на
  `/{locale}/login?return_to=...` если не залогинен.
- **Multi-role**: user может иметь любую комбинацию ролей через
  `user_roles` M2M (admin-преподаватель ≡ admin + instructor). Default
  landing после login — priority `admin > instructor > student`.
  Nav-zone-switcher показывает links на другие доступные зоны.
- **Deactivated user** (`users.deactivated_at IS NOT NULL`) попадает
  на `/[locale]/inactive` независимо от роли. `/account` доступен.
- См. §6 (детальные карты) и `decisions_archive.md` 2026-05-17.

### Translation pairs requirement

**Каждый контентный объект существует в наборе всех активных локалей.**
Build-step валит при отсутствии пары без `monolingual: true`.

### SEO baseline

- Уникальные title/description per page
- Open Graph + Twitter Card
- Schema.org: `Course`, `Person`, `FAQPage`, `VideoObject`, **`Offer`** (для
  тиров с ценами)
- Canonical URL включающий локаль
- hreflang на каждой странице

---

## 4. Архитектура контента

### Главный принцип

**Каждый факт о продукте имеет ровно одно место хранения. Никаких чисел,
цен, длительностей, списков фич свободным текстом в коде страниц.** Страницы —
проекции данных через шаблоны.

### Граница: Content Collections vs D1+R2

| Тип контента                                    | Где живёт                          | Почему                           |
|-------------------------------------------------|------------------------------------|----------------------------------|
| Маркетинговое описание программ                 | Content Collections (git)          | публичное, индексируется         |
| **Тиры программ** (цены, фичи)                  | **Content Collections (git)**      | **публичное, до регистрации**    |
| **Bundles** (включённые programmes, тиры)       | **Content Collections (git)**      | **публичное**                    |
| Био инструкторов                                | Content Collections (git)          | публичное                        |
| Сегментные лендинги, страницы (about, faq, legal) | Content Collections (git)        | публичное, статика               |
| Журнал                                          | Content Collections (git)          | публичное, agent-pipeline        |
| Публичная галерея /works                        | Content Collections (git) + R2     | публичное, медиа в R2            |
| **Учебные модули (текст, упражнения, prompt)**  | **D1 (метаданные) + R2 (тела)**    | **приватное, runtime**           |
| **Видео модулей**                                | **R2 (приватное)**                  | бинарное, защищённое             |
| **Записи сессий**                                | **R2 (приватное)**                  | бинарное, доступно участникам    |
| **Домашки студентов**                            | **R2 (приватное)**                  | бинарное, ACL                    |
| **Запуски, enrollments, sessions, homework, feedback** | **D1**                       | runtime операции                 |
| **Платежи, промо, рефералы, resource caps**     | **D1**                              | runtime, проверяется на операциях|
| **Пользователи**                                 | **D1**                              | runtime                          |
| Глобальные настройки сайта                      | KV                                 | редкие изменения, без FK         |

**Цены публичны.** Тиры с ценами лежат в Content Collections — на странице
`/{locale}/[programme-id]` они видны без auth.

**Учебный контент приватный** и не попадает в билд-артефакты.

### Слой Content Collections (file-based, публичный)

```
/src/content/
├── programmes/[id].{locale}.mdx           — programme + tiers (с ценами и фичами)
├── bundles/[id].{locale}.mdx              — bundle + tiers + includes_programmes
├── instructors/[id].{locale}.mdx
├── segments/[id].{locale}.mdx
├── pages/[id].{locale}.mdx                — about, faq, contact, legal-*
├── journal/[id].{locale}.mdx
├── works/[id].{locale}.mdx
└── voice-guide.md                         — бренд-голос для агентов
```

### Слой D1+R2 (приватный, runtime)

D1 хранит метаданные, R2 — тела. См. §9.

### Слой KV (config)

Только глобальные настройки. См. §13.

### Anti-hardcode правила

1. Нет цен в страницах вне Content Collections (programmes/bundles tiers)
   и API-ответов из D1. Линтер на pre-commit ловит regex `\$\d+` и `[€£¥₽]\d+`
2. Нет упоминаний количества модулей/сессий свободным текстом — только
   через `<Fact source="programme:[id]" field="..." />`
3. Нет meta-тегов с захардкоженным title/description
4. Нет дублирования "What's Included" — один компонент `<TierFeatures>`
5. Schema.org JSON-LD генерируется компонентами (`<CourseSchema>`,
   `<OfferSchema>`)
6. CTA ведут только на `/{locale}/apply`, `/{locale}/runs`, `/{locale}/dashboard`

### Build-time валидация

`pnpm build` падает при нарушениях: zod schema, отсутствие translation
pair без `monolingual:true`, хардкод по линтеру, ссылка на несуществующий
id (включая ссылки `bundles.includes_programmes` на programme id), `<Fact />`
с несуществующим полем, **дублирующиеся id между programmes и bundles**
(один namespace для URL).

---

## 5. Модель: modules / programmes / enrollments

> **Версия модели:** 2026-05-17 (см. `decisions_archive.md`). Предыдущая
> модель с `tiers` / `bundles` / `runs` отменена в пользу простой
> цепочки **module → programme → enrollment**. Sessions/homework/feedback
> описаны отдельным под-разделом — спецификация Sprint 2+.

### Атомарная единица — модуль (first-class)

Модули существуют **независимо** от программ и могут переиспользоваться
в любом наборе. Источник правды — **отдельный git-репозиторий**
(`lottoprof/moirai-content` или аналог), где методисты коммитят:

```yaml
# modules/visual-language.en.mdx (внешний repo)
id: visual-language
title: 'Visual Language'
track: directing               # 'directing'|'editing'|'scriptwriting'|'producing'|'sound'
has_video: true
has_homework: true
has_text: true
default_duration_days: 7
status: published               # 'draft'|'published'|'archived'
requires_modules:               # модули, без которых X не идёт
  - directors-eye
  - story-structure
---
{body markdown — лекция, упражнения, prompt для homework}
```

**Sync pipeline** (Sprint 2+): GH Actions в external repo на push в main
постит manifest в `POST /api/admin/modules/sync`. Endpoint:
- UPSERT `modules` (PK `slug+locale`) с метаданными
- PUT body в R2 (`modules/{slug}.{locale}.md`)
- Видео — отдельный upload через wrangler r2 (методист, не CI)

**Lifecycle модуля:**
```
draft  →  published  →  archived
                          ↑
                          никогда → "deleted"
```
- **archived** скрывается из catalogue, но existing enrollments продолжают
  его видеть с маркером "Legacy content".
- Hard DELETE возможен только admin'ом через "Cleanup" когда usage = 0
  (R2 body тоже удаляется).
- Sync pipeline **рефьюзит** silent-delete если есть references из
  `enrollment_modules` — downgrade'ит до `archived` + warning.

**Locale completeness:** каждый модуль обязан иметь **обе** локали
(`{slug}.en.mdx` И `{slug}.ru.mdx`). External repo CI ломает merge при
mismatch.

**`requires_modules` — dependency graph:** модули, без которых данный
не имеет смысла в одном enrollment. **Циклы запрещены** — external repo
CI делает topological sort, ломает merge при цикле.

### Programme — Content Collection шаблон

Programme = ordered list of modules + price + features + marketing.
Лежит в `src/content/programmes/{id}.{locale}.mdx`:

```yaml
# src/content/programmes/beginner.{en,ru}.mdx (в moirai-репо)
id: beginner
title: 'Beginner'
default_modules:                 # ссылки на module slugs
  - directors-eye
  - story-structure
  - the-cut
  - visual-language
  - pre-production
  - character-conflict
  # ...12 модулей
price_amount: 39900              # центы, USD по умолчанию
price_currency: USD
features:                        # snapshot копируется в enrollment.features_json
  live_sessions: true
  pre_session_corrections: true
  session_recordings: true
  consultations_count: 1
marketing:
  tagline: 'Twelve modules to your first short film'
  description: '...'
  og_image: 'beginner-og.jpg'
---
{body — маркетинговый текст для /programmes/beginner страницы}
```

**Specials:**

- `programmes/individual.{en,ru}.mdx` — `default_modules: []`. Маркетинг
  "Соберём программу под вас". Студент покупает за depositamount или $0,
  instructor потом composes модули постфактум.

**Drop сущности (по сравнению со старой моделью):**

- ❌ **Tiers** как отдельное измерение. Варианты ("Beginner Self-paced"
  vs "Beginner Standard") = разные programmes.
- ❌ **Bundles** как отдельная сущность. Пакет "Beginner + Intermediate
  со скидкой" = published programme с подобранными модулями обоих и
  bundle-ценой.
- ❌ **Runs / cohorts.** Sprint 2+ при появлении scheduled-cohort UX.

### Enrollment — mutable D1 instance

`enrollment` = `user × programme_slug` + snapshot цены/фич + mutable
список модулей. Запись в D1, не Content Collection.

```sql
enrollments (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT REFERENCES users,
  programme_slug       TEXT NOT NULL,                        -- ссылка на CC programme
  status               TEXT CHECK IN ('active','completed','cancelled','refunded'),
  price_paid_amount    INTEGER NOT NULL,                     -- snapshot на момент покупки
  price_paid_currency  TEXT NOT NULL,
  features_json        TEXT NOT NULL,                        -- snapshot programme.features
  lead_instructor_id   TEXT REFERENCES users,                -- single lead, NULL = unassigned
  enrolled_at, completed_at, cancelled_at, created_at, updated_at
)

enrollment_modules (
  enrollment_id    TEXT REFERENCES enrollments ON DELETE CASCADE,
  module_slug      TEXT NOT NULL,                            -- ссылка на modules
  order_idx        INTEGER NOT NULL,
  added_by         TEXT REFERENCES users,                    -- кто добавил (instructor/admin/'system' для initial)
  added_at         INTEGER NOT NULL,
  PRIMARY KEY (enrollment_id, module_slug)
)
```

**Три flow одной механикой:**

| Сценарий | enrollment | enrollment_modules |
|---|---|---|
| **Ready programme** (купил Beginner) | `slug='beginner', price=39900, features={...}` | копия `programme.default_modules` + auto-resolve `requires_modules`, `added_by='system'` |
| **Individual** (купил individual) | `slug='individual', price=0` или deposit | initially 0 строк, instructor добавляет постфактум |
| **Extension** (existing + добавили модуль) | без изменений | новая строка с `added_by=<instructor.id>`, audit_log entry |

### Lead instructor — single per enrollment

`enrollments.lead_instructor_id NULLABLE`. Только lead + admin могут:
- add/remove модули
- менять price
- mark complete

Другие instructor'ы видят enrollment **read-only**, могут оставлять
feedback на homework через `feedback.instructor_id`.

**Cohort scheduling с 2+ instructors** — Sprint 2 через `runs.lead_instructor_id`
+ `run_instructors` M2M. Не конфликтует с enrollment-level lead.

### Auto-resolve `requires_modules`

При добавлении модуля X в enrollment server рекурсивно подтягивает
все транзитивные deps через `resolveDependencies(slug)`. Алгоритм —
DFS с `visited` set (защита от циклов на runtime). Post-order вставка
гарантирует deps идут раньше зависящего по `order_idx`.

При удалении модуля Y server проверяет `getDependents(enrollment_id, slug)`
— если есть зависящие, возвращает 409 со списком. UI предлагает
"Remove all together".

### Refund / cancellation семантика

`enrollment.status = 'refunded'` или `'cancelled'` → access revoked
через централизованный `hasAccessToModule(env, userId, slug)`:

```ts
if (user.deactivated_at) return false;
const ok = await db.prepare(`
  SELECT 1 FROM enrollments e
  JOIN enrollment_modules em ON em.enrollment_id = e.id
  WHERE e.user_id=? AND em.module_slug=? AND e.status='active'
  LIMIT 1
`).bind(userId, slug).first();
return !!ok;
```

Данные в `enrollment_modules` остаются (audit), но видимость для
студента — нулевая. Re-activation: `UPDATE enrollments SET status='active'`
→ доступ восстанавливается.

### Что фиксировано / что mutable

| Атрибут | Где живёт | Меняется после покупки? |
|---|---|---|
| Module metadata + body | external repo → D1 + R2 | методистами через external repo (sync) |
| Programme description + default_modules | moirai Content Collection | через git+deploy (для будущих enrollments) |
| `enrollment.price_paid_*` | D1 | нет (snapshot) |
| `enrollment.features_json` | D1 | нет (snapshot) — re-purchase даёт новые features |
| `enrollment_modules` список | D1 | да — instructor может add/remove |
| `enrollment.lead_instructor_id` | D1 | да — admin reassigns |
| `enrollment.status` | D1 | да — refund / cancel / complete |

---

## 6. Структура сайта

### Публичные страницы

```
/{locale}/                              — Home
/{locale}/[id]                          — programme или bundle (один namespace)
/{locale}/runs                          — список открытых запусков (D1)
/{locale}/runs/[id]                     — конкретный запуск с tier'ом и ценой

/{locale}/for/[segment]                 — сегментные лендинги
/{locale}/instructors/[id]              — профили инструкторов
/{locale}/about

/{locale}/works                         — галерея студенческих работ
/{locale}/works/[slug]                  — отдельный фильм

/{locale}/journal                       — индекс блога
/{locale}/journal/[slug]                — пост

/{locale}/faq
/{locale}/contact
/{locale}/legal/{terms,privacy,refund}

/{locale}/apply                         — форма заявки (можно с promo/referral кодом)

/                                       — редирект по Accept-Language
```

### Источник данных каждой страницы

| URL                                     | Источник                                              |
|-----------------------------------------|-------------------------------------------------------|
| `/`                                      | редирект по Accept-Language                            |
| `/{locale}/`                            | `pages/home.{locale}.mdx` + programmes + bundles       |
| `/{locale}/[id]`                        | `programmes/[id]` ИЛИ `bundles/[id]` Content Collection|
| `/{locale}/runs`, `/runs/[id]`          | D1 + Content Collection (для тира и фич)              |
| `/{locale}/for/[segment]`               | `segments/[id].{locale}.mdx`                           |
| `/{locale}/instructors/[id]`            | `instructors/[id].{locale}.mdx`                        |
| `/{locale}/about`, `/contact`, `/faq`, `/legal/*` | `pages/[id].{locale}.mdx`                    |
| `/{locale}/works`, `/works/[slug]`      | `works/*` Collection + R2                              |
| `/{locale}/journal`, `/journal/[slug]`  | `journal/*` Collection                                 |
| `/{locale}/apply`                       | компонент формы → `/api/apply` → D1                    |

На страницах `/{locale}/[id]` для programme и bundle показываются **все
тиры с ценами** — это публичный прайс-лист, видный без регистрации.

### Student ЛК (role: 'student')

```
/{locale}/dashboard                     — overview (greeting, stats, continue learning, modules grid)
/{locale}/dashboard/modules             — все модули моего enrollment'a с прогрессом
/{locale}/dashboard/modules/[slug]      — модуль: текст + видео (Vidstack) + homework prompt
/{locale}/dashboard/homework            — мои сданные работы + фидбэк
/{locale}/dashboard/homework/[id]       — работа с timestamp-фидбэком
/{locale}/dashboard/sessions            — мои live-сессии (Sprint 2)
/{locale}/dashboard/referrals           — реферальная активность (Sprint 2+)
```

Layout: `src/layouts/dashboard/Layout.astro`. Nav: `DashboardNav` (Dashboard
/ Modules / Homework / Account →) + zone-switcher если у user'а есть
другие роли.

### Instructor zone (role: 'instructor')

```
/{locale}/instructor                    — review queue + my students + next session
/{locale}/instructor/students           — все мои студенты (где я lead_instructor)
/{locale}/instructor/students/[id]      — детали студента: enrollment, модули, прогресс
/{locale}/instructor/students/[id]/compose  — composer модулей (для individual или extensions)
/{locale}/instructor/homework           — review queue (homework awaiting feedback)
/{locale}/instructor/homework/[id]      — review страница (видео + timestamp-feedback)
/{locale}/instructor/sessions           — мои предстоящие сессии (Sprint 2)
```

Layout: `src/layouts/instructor/Layout.astro`. Nav: `InstructorNav`
(Queue / My students / Schedule / Account →) + zone-switcher.

### Admin panel (role: 'admin', без локали)

```
/admin                            — overview (платформ-метрики)
/admin/users                      — список пользователей + drawer для CRUD
/admin/enrollments                — список enrollments + grant new
/admin/modules                    — каталог модулей из D1 (read-only снапшот из external repo)
/admin/instructors                — список instructor'ов с load metrics
/admin/queues                     — pending homework / awaiting setup per-instructor
/admin/settings                   — KV-настройки (Sprint 2+)
```

Layout: `src/layouts/admin/Layout.astro`. Nav: `AdminNav` (Overview / Users
/ Enrollments / Modules / Account →) + zone-switcher если user также
instructor.

### Cross-zone (auth required, любая роль)

```
/{locale}/account                       — профиль, locale, sign-in methods (password / OAuth)
/{locale}/inactive                      — заглушка для deactivated user'ов
```

`/account` использует layout динамически по primary role (admin → AdminLayout,
instructor → InstructorLayout, иначе → DashboardLayout).

### Что не в карте намеренно

- ❌ `/ai-module` — агенты под капотом, не в продукте
- ❌ Отдельные страницы для треков
- ❌ Отдельная `/pricing` — цены на programme/bundle страницах
- ❌ Глоссарий, тулкит как страницы — материалы в ЛК
- ❌ Встроенный групповой чат

---

## 7. Хранение и доставка медиа

### R2 раскладка

Один bucket `moirai-media`, два префикса верхнего уровня:

```
content/                                    — текстовые тела (markdown)
├── modules/<id>/<locale>/body.md           — приватный
├── modules/<id>/<locale>/exercises.md      — приватный
├── modules/<id>/<locale>/homework-prompt.md — приватный

media/                                      — бинарные активы
├── modules/<id>.mp4                        — приватный
├── modules/<id>.poster.jpg                 — публичный
├── sessions/<session_id>/recording.mp4     — приватный, доступен участникам
├── homework/<group_or_user>/<sub_id>.mp4   — приватный, ACL
├── works/<slug>.mp4                        — публичный
├── works/<slug>.poster.jpg                 — публичный
├── instructors/<id>/photo.jpg              — публичный
├── journal/<slug>/cover.jpg                — публичный
└── materials/<module_id>/<file>.pdf        — приватный
```

### Public CDN для публичного

Публичные пути отдаются через `media.moirai.film` → public R2 alias.

### Gated доступ через Worker

`GET /api/media/[type]/[id]`:

| type           | кто может получить URL                                          |
|----------------|-----------------------------------------------------------------|
| `module-text`  | юзер с активным enrollment где programme содержит этот модуль   |
|                | **И** где tier.features предоставляет доступ к этому типу       |
| `module-video` | то же                                                            |
| `session`      | участник через `session_participants` или инструктор            |
| `homework`     | автор, **участники той же group_id**, или инструктор            |
| `material`     | те же правила что у parent module                               |

`tier.features` проверяется через snapshot в `runs.tier_id` при resolve.

Логика инкапсулирована в `resolveAndAuthorize(type, id, user, db, contentCache)`.

### Видеоформат и CORS

MP4 progressive H.264 main, AAC, +faststart. CORS allow Range от
`moirai.film` и `localhost:4321`.

---

## 8. Плеер

### Vidstack

Headless-первый, ~50 KB. Кастомизация через CSS-переменные.

### Два режима

**Mode `lecture`** (модули и записи сессий): стандартные controls, position
remember, скорости.

**Mode `review`** (homework): + timestamp markers, клик → seek + bubble,
side panel с комментариями. У instructor — кнопка "Add comment at current time".

### Гидрация

Astro island с `client:visible`. Публичный сайт — native `<video>` для
`/works`.

---

## 9. Схема D1

**20 таблиц.** Изменения v0.8.3 (2026-05-14):
- Добавлена таблица **`jwt_keys`** — multiple HS256-ключи с rotation
  (active/deprecated/revoked), шифруются `MASTER_SECRET` через AES-GCM.
  301-стиль 3-уровневой системы (см. `decisions_archive.md`
  2026-05-14).

Изменения v0.8.2 (2026-05-12):
- `users.password_hash` и `users.oauth_provider/oauth_id` удалены
- Новая таблица **`auth_methods`** — multi-method auth (один user
  может иметь password + N OAuth identities одновременно)
- Новая таблица **`audit_log`** — audit-trail для всех auth-событий
  (compliance + forensic)
- См. `decisions_archive.md` 2026-05-12 — auth model overhaul.

**Type conventions (для всей схемы):**
- IDs: `TEXT` (UUID v7 или nanoid), не `INTEGER AUTOINCREMENT`
- Timestamps: `INTEGER` unix-seconds, не `TEXT` ISO
- Booleans: `INTEGER 0/1` (SQLite не имеет нативного bool)
- Money: `INTEGER` cents
- Enums: `TEXT` с `CHECK` constraint
- IP-адреса: `sha256(ip + IP_HASH_SALT)`, plaintext не хранится (GDPR)

### Образовательное ядро

```sql
modules (
  id                    TEXT PRIMARY KEY,
  programme_id          TEXT NOT NULL,
  track                 TEXT NOT NULL,
  order_in_programme    INTEGER NOT NULL,
  default_duration_days INTEGER NOT NULL,
  requires_homework     BOOLEAN NOT NULL,
  has_text              BOOLEAN NOT NULL DEFAULT 0,
  has_video             BOOLEAN NOT NULL DEFAULT 0,
  video_duration_seconds INTEGER,
  r2_video_key          TEXT
)

module_content (
  module_id             TEXT REFERENCES modules,
  locale                TEXT NOT NULL,
  title                 TEXT NOT NULL,
  summary               TEXT,
  r2_body_key           TEXT,
  r2_exercises_key      TEXT,
  r2_homework_prompt_key TEXT,
  PRIMARY KEY (module_id, locale)
)
```

### Запуски и расписание

```sql
runs (
  id              TEXT PRIMARY KEY,
  programme_id    TEXT NOT NULL,                  -- ссылка на Content Collection
  tier_id         TEXT NOT NULL,                  -- snapshot из programmes[].tiers[].id
  language        TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  price_amount    INTEGER NOT NULL,               -- snapshot из tier.base_price или override
  price_currency  TEXT NOT NULL,
  max_students    INTEGER,
  status          TEXT NOT NULL
)

run_modules (
  id                    TEXT PRIMARY KEY,
  run_id                TEXT REFERENCES runs,
  module_id             TEXT NOT NULL,
  order_in_run          INTEGER NOT NULL,
  module_starts_on      DATE NOT NULL,
  homework_due_on       DATE,
  duration_days_used    INTEGER NOT NULL
)
```

### Покупка и обучение

```sql
enrollments (
  id              TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES users,
  run_id          TEXT REFERENCES runs,
  payment_id      TEXT REFERENCES payments,        -- может быть несколько enrollments на один payment (bundle)
  granted_at      TIMESTAMP NOT NULL,
  status          TEXT NOT NULL,                  -- active/completed/refunded
  completed_at    TIMESTAMP
)

sessions (
  id                TEXT PRIMARY KEY,
  instructor_id     TEXT REFERENCES users,
  scheduled_at      TIMESTAMP,
  duration_minutes  INTEGER NOT NULL,
  status            TEXT NOT NULL,
  meeting_url       TEXT,
  recording_r2_key  TEXT,
  notes_md          TEXT
)

session_participants (
  session_id    TEXT REFERENCES sessions,
  enrollment_id TEXT REFERENCES enrollments,
  PRIMARY KEY (session_id, enrollment_id)
)

session_modules (
  session_id    TEXT REFERENCES sessions,
  run_module_id TEXT REFERENCES run_modules,
  PRIMARY KEY (session_id, run_module_id)
)

homework (
  id              TEXT PRIMARY KEY,
  enrollment_id   TEXT REFERENCES enrollments,
  run_module_id   TEXT REFERENCES run_modules,
  r2_video_key    TEXT,                           -- может быть общим для group_id
  notes           TEXT,
  group_id        TEXT,                           -- NULL = индивид., UUID = групповая
  score           TEXT,                           -- per-student оценка
  submitted_at    TIMESTAMP NOT NULL
)

feedback (
  id                TEXT PRIMARY KEY,
  homework_id       TEXT REFERENCES homework,
  instructor_id     TEXT REFERENCES users,
  kind              TEXT NOT NULL,                -- 'pre_session_correction' | 'session_note'
  body_text         TEXT NOT NULL,
  timestamp_seconds INTEGER,
  created_at        TIMESTAMP NOT NULL
)
```

### Промо-коды

```sql
promo_codes (
  code              TEXT PRIMARY KEY,             -- 'EARLYBIRD2026'
  discount_type     TEXT NOT NULL,                -- 'percent' | 'fixed_amount'
  discount_value    INTEGER NOT NULL,             -- 20 (=20% или 20 центов)
  applies_to_kind   TEXT NOT NULL,                -- 'any' | 'programme' | 'tier' | 'run' | 'bundle'
  applies_to_id     TEXT,                         -- NULL для 'any'
  starts_at         TIMESTAMP,
  expires_at        TIMESTAMP,
  max_uses          INTEGER,                      -- NULL = unlimited
  max_uses_per_user INTEGER NOT NULL DEFAULT 1,
  uses_count        INTEGER NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT 1,
  campaign          TEXT,                         -- 'instagram-feb-2026' для аналитики
  notes             TEXT,
  created_at        TIMESTAMP NOT NULL
)
```

### Реферальная система

```sql
-- referral_code — поле в users, не отдельная таблица:
-- users.referral_code TEXT UNIQUE — генерируется при регистрации

referrals (
  id                  TEXT PRIMARY KEY,
  referrer_user_id    TEXT REFERENCES users,      -- кто пригласил
  referee_user_id     TEXT REFERENCES users,      -- кого пригласили
  referee_payment_id  TEXT REFERENCES payments,   -- оплата которая триггернула награду
  reward_kind         TEXT NOT NULL,              -- MVP: 'discount_on_next'
                                                   -- future: 'cash_credit', 'extra_consultation'
  reward_value        INTEGER NOT NULL,           -- центов или количество
  reward_promo_code   TEXT,                       -- сгенерированный код для применения
  status              TEXT NOT NULL,              -- pending → awarded → redeemed → expired
  expires_at          TIMESTAMP,                  -- срок жизни награды
  created_at          TIMESTAMP NOT NULL,
  awarded_at          TIMESTAMP,
  redeemed_at         TIMESTAMP,
  notes               TEXT
)
```

### Resources & soft constraints (см. §10)

```sql
resources (
  id            TEXT PRIMARY KEY,
  scope_type    TEXT NOT NULL,
  scope_id      TEXT,
  unit          TEXT NOT NULL,
  capacity      INTEGER,
  warn_at_pct   INTEGER NOT NULL DEFAULT 80,
  hard_stop     BOOLEAN NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMP NOT NULL,
  updated_at    TIMESTAMP NOT NULL
)

resource_consumption (
  resource_id   TEXT REFERENCES resources,
  period_key    TEXT NOT NULL,
  consumed      INTEGER NOT NULL,
  computed_at   TIMESTAMP NOT NULL,
  PRIMARY KEY (resource_id, period_key)
)
```

### Auth, identity, audit

```sql
users (
  id                TEXT PRIMARY KEY,             -- UUID v7 / nanoid
  email             TEXT UNIQUE NOT NULL,
  email_verified_at INTEGER,                      -- NULL = не верифицирован
  name              TEXT,
  locale            TEXT NOT NULL CHECK(locale IN ('en','ru')),
  role              TEXT NOT NULL DEFAULT 'student'
                    CHECK(role IN ('student','instructor','admin')),
  referral_code     TEXT UNIQUE NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
)
-- НЕТ password_hash, oauth_provider, oauth_id — см. auth_methods

auth_methods (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL
                    CHECK(kind IN ('password','google','discord')),
  -- password: PBKDF2-SHA256 600k iter, формат `salt:hash` base64
  secret_hash       TEXT,
  -- OAuth: stable provider user id (Google "sub", Discord snowflake)
  provider_user_id  TEXT,
  provider_email    TEXT,
  provider_email_verified INTEGER,                -- 0/1, что сказал провайдер на момент link
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER,
  UNIQUE(user_id, kind),                          -- один password / один google / один discord на user
  UNIQUE(kind, provider_user_id)                  -- один Google ID = один user
)

auth_sessions (
  id              TEXT PRIMARY KEY,               -- refresh token id (opaque)
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,                  -- sha256(refresh_secret)
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  last_seen_at    INTEGER,
  user_agent      TEXT,
  ip_hash         TEXT,                           -- sha256(ip + IP_HASH_SALT), GDPR-safe
  revoked_at      INTEGER                         -- soft-revoke
)

audit_log (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  event         TEXT NOT NULL,                    -- register / login / logout / oauth_link / password_set / email_verify / password_reset / login_failed
  method        TEXT,                             -- password / google / discord
  ip_hash       TEXT,
  user_agent    TEXT,
  metadata      TEXT,                             -- JSON: причина failure, провайдер, etc.
  created_at    INTEGER NOT NULL
)

jwt_keys (
  kid               TEXT PRIMARY KEY,             -- "v1-YYYY-MM-DD-<uuid8>"
  secret_encrypted  TEXT NOT NULL,                -- AES-GCM blob (JSON: iv, ct, tag in base64), encrypted via env.MASTER_SECRET
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active','deprecated','revoked')),
  created_at        INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,
  rotated_at        INTEGER,                      -- когда active → deprecated
  revoked_at        INTEGER                       -- когда → revoked
)
-- Partial unique index: ровно один active ключ одновременно
-- CREATE UNIQUE INDEX idx_jwt_keys_one_active ON jwt_keys(status) WHERE status='active';

payments (
  id                TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users,
  purchase_kind     TEXT NOT NULL,                -- 'run' | 'bundle' (informational)
  purchase_ref      TEXT NOT NULL,                -- run_id или bundle_id (informational)
  amount            INTEGER NOT NULL,             -- финальная сумма после скидок
  currency          TEXT NOT NULL,
  promo_code        TEXT,                         -- применённый промо
  discount_amount   INTEGER NOT NULL DEFAULT 0,   -- сколько скинуто (центов)
  applied_referral_id TEXT REFERENCES referrals,  -- если оплата триггернула реферальную награду
  mor_provider      TEXT NOT NULL,
  mor_order_id      TEXT NOT NULL,
  status            TEXT NOT NULL,
  raw_payload       TEXT,
  created_at        TIMESTAMP NOT NULL
)
```

**Изменения относительно v0.7:**
- `runs` приобрёл `tier_id TEXT NOT NULL` (snapshot из Content Collection)
- `users` приобрёл `referral_code TEXT UNIQUE NOT NULL`
- `payments` переработан: `run_id` удалён (связь через `enrollments`),
  добавлены `purchase_kind`, `purchase_ref`, `promo_code`, `discount_amount`,
  `applied_referral_id`
- Новые таблицы: `promo_codes`, `referrals`
- D1: 15 → 17 таблиц

**v0.8.2 (2026-05-12):**
- `users` урезан: убраны `password_hash`, добавлен `email_verified_at`
- Новая таблица `auth_methods` — multi-method auth (`password` +
  N OAuth providers per user)
- `auth_sessions` расширена: `ip_hash` (GDPR), `user_agent`, `revoked_at`
- Новая таблица `audit_log`
- D1: 17 → 19 таблиц
- Field type conventions formalized (TEXT IDs, INTEGER timestamps, etc)

Детализация индексов, FK ON DELETE — частично закрыта в v0.8.2 для
auth-таблиц; для остальных — см. `[TBD-2]`.

---

## 10. Resources & soft constraints

(содержание раздела без изменений от v0.7)

### Зачем

Платформа должна знать о любых ёмкостных лимитах (часы инструктора в
неделю, число студентов в run, число одновременных сессий в день),
проверять их при операциях и предупреждать админа о приближении к границе.
Без жёстких чисел в коде.

### Модель

`resources` — определение типа ресурса, capacity, warn_at_pct, hard_stop.
`resource_consumption` — что забронировано/потреблено.

### Как работает

При операции Worker определяет затронутые ресурсы, считает
`consumption_after`, сравнивает с `capacity * warn_at_pct%`, возвращает
warnings. При `hard_stop=true` и превышении 100% — отказывает.

### Storage стратегия

MVP — computed (Worker считает on-demand). Materialized — `[TBD-9]`.

### Что считается ресурсом — конфигурация

Стартовый набор `resources` создаётся админом через `/admin/resources`.
Архитектура поддерживает любые типы.

### Гарантии

- Soft warnings, не hard locks по умолчанию
- Eventual consistency приемлема при computed
- Backward-compatible: удаление/добавление `resources` не ломает операции

---

## 11. Agent-driven workflow

### Граница: что делают агенты, что делают люди

| Делают агенты (под капотом)                              | Делают только люди                          |
|----------------------------------------------------------|---------------------------------------------|
| Драфты постов журнала                                    | Pre-session corrections и session notes    |
| Драфты сегментных страниц                                | Live сессии                                 |
| Поддержание актуальности переводов                       | Финальное одобрение публикации              |
| Schema.org markup при изменении данных                   | Решения о цене, программе, бренде           |
| Email-кампании (драфты, отправка после одобрения)        | Communication tone в кризисных кейсах       |
| Customer support (драфты ответов на типовые запросы)     | Любая коммуникация связанная с деньгами     |
| Code maintenance                                         | Архитектурные решения                       |
|                                                           | Оценки homework (`homework.score`)         |
|                                                           | Создание/деактивация промо-кодов            |
|                                                           | Manual review реферальной активности        |

### Что агенты НЕ показывают и НЕ говорят

- Никаких "Generated with AI" badges
- Никаких упоминаний AI в продукте студенту
- Никакой `/ai-module` страницы
- Authorship постов — реальные имена с редакторской ответственностью

### Pipeline для Journal

```
/drafts/_briefs/                  — брифы
/drafts/posts/                    — драфты в работе
/src/content/journal/             — опубликованное
```

Команды через claude code / codex CLI с git+filesystem MCP.

### Voice guide и MCP setup

`/voice-guide.md` поддерживается людьми. MCP: filesystem, git, опционально
search. Агент не имеет прямого доступа к D1 продакшна.

---

## 12. Локальная разработка

### Системные требования

- Node.js 22 LTS (через `nvm`)
- pnpm
- git

### Tooling парного написания

- vim / neovim
- claude code CLI / codex CLI

### Project deps

`astro`, `@astrojs/cloudflare`, `@astrojs/mdx`, `@astrojs/sitemap`,
`wrangler`, `@cloudflare/workers-types`, `zod`, `vidstack`, `aws4fetch`,
`resend`.

### Структура серверного кода

- `src/middleware.ts` — Astro middleware (locale detection, JWT
  verify когда auth подключится).
- `src/pages/api/**.ts` — SSR endpoints (`prerender = false`),
  обрабатывают POST/GET, читают `Astro.locals.runtime.env`.
- `src/lib/server/**.ts` — server-only utils (никогда не должны
  попадать в client bundle). Конвенция: всё что использует
  `crypto.subtle`, читает env / DB / KV / secrets — здесь.
  Модули: `crypto.ts` (AES-GCM), `hash.ts` (sha256 / IP-hash /
  JWT fingerprint), `password.ts` (PBKDF2 hash/verify),
  `jwt.ts` (sign/verify с rotation), далее по мере роста:
  `session.ts`, `oauth/*.ts`, `turnstile.ts`, `ratelimit.ts`,
  `audit.ts`.
- `db/types.ts` — ручные TS-типы D1 row shapes (top-level, не под
  `src/`). Обновляется атомарно с каждой миграцией.

### Workflow с D1

- Миграции — `.sql` файлы в `migrations/`, применяются через
  `wrangler d1 migrations create/apply`
- TS-типы — пишутся вручную в `db/types.ts` рядом с миграциями
- Запросы — через `env.DB.prepare(sql).bind(...).first()/all()/run()`
- Локальная БД — `.wrangler/state/v3/d1/*.sqlite`, можно открыть любым
  SQLite клиентом для отладки

### Два режима dev-сервера

- `pnpm dev` — Astro/Vite, HMR, без CF bindings
- `pnpm wrangler pages dev` — miniflare с D1/R2/KV/env

### Локальные эмуляторы

`.wrangler/state/v3/{d1,r2,kv}/`.

---

## 13. Админ-панель и граница D1 / KV

### Кто такой админ

Пользователи с `users.role = 'admin'`.

### Простой admin вход

- `/admin/login` — без локального префикса
- `/admin/*` — middleware
- Auth через `auth_sessions`
- 2FA — TBD-4

### Что админ редактирует через UI vs через git

| Через UI (D1+R2/KV)              | Через git (Content Collections)              |
|-----------------------------------|----------------------------------------------|
| Каталог модулей: атрибуты, тело   | Маркетинговое описание программы              |
| Создание `run`: tier + price      | **Тиры программ (фичи, base price)**         |
| Расписание `run_modules`          | **Bundles (что входит, тиры, цены)**         |
| Зачисление студентов              | Бренд-голос (`/voice-guide.md`)              |
| Создание сессий: участники, модули| Био инструктора                              |
| Pre-session corrections           | Сегментные страницы                          |
| Session notes                     | Журнал                                       |
| Оценки homework (`score`)         | Юридические страницы                         |
| **Промо-коды (CRUD)**             |                                              |
| **Реферальная активность (read, manual award)** |                              |
| Resources (capacity, warn_at_pct) |                                              |
| KV-настройки сайта                |                                              |

### Граница D1 / KV

**Принцип: одна сущность — одно место.**

**В D1** — все runtime-сущности (17 таблиц, см. §9).

**В KV** — только глобальные настройки сайта:

```
moirai-config (KV namespace)
├── ui:hero_urgency_text
├── ui:waitlist_form_open
├── flags:registration_open
├── flags:works_publishing
├── flags:locale_navigation:*
├── flags:referrals_enabled
├── flags:promo_codes_enabled
├── contact:support_email
├── contact:social.*
└── seo:home_meta_overrides
```

**Что НЕ в KV:**

- ❌ Цены — Content Collections (тиры) + `runs` (D1)
- ❌ Список программ и bundles — Content Collections
- ❌ Список инструкторов — `users` (D1)
- ❌ Список локалей — `astro.config.mjs`
- ❌ Промо-коды (содержание) — `promo_codes` (D1)
- ❌ Реферальные коды — `users.referral_code` (D1)
- ❌ Resource caps — `resources` (D1)
- ❌ Любые персональные данные — D1
- ❌ Любые токены, секреты — Workers `env`

---

## 14. Открытые вопросы

### `[TBD-2]` Детализация D1 — **следующий технический шаг**

- Точные типы (TEXT vs INTEGER размеры, CHECK constraints)
- Индексы (enrollments, homework, session_participants, session_modules,
  promo_codes.active+expires_at, referrals.referrer_user_id, resource_consumption)
- FK ON DELETE поведение
- Политики удаления (TTL для recordings, истёкших промо)
- Backup-стратегия

### `[TBD-3]` Приём платежей

- MoR выбор (Lemon Squeezy / Paddle)
- Webhook handler: order_created, refund_issued, etc.
- Атомарная двойная запись: payment + N enrollments (для bundle)
- Идемпотентность webhook'ов
- Sales tax / VAT обработка
- Налоговый flow

### `[TBD-4]` Доработка `users` и auth

- Email verification, password reset, 2FA для admin
- Audit log, soft delete, GDPR-export
- Rate limiting
- Profile fields

### `[TBD-5]` Имплементация agent pipeline

- MCP servers, voice-guide, prompt-templates
- CI/CD: pre-commit linter, build-time validation

### `[TBD-6]` Заполнение каталога модулей

В работе. Не блокирует разработку.

### `[TBD-8]` Конкретные resource types и UI предупреждений

Стартовый набор `resources` записей и UI представление warnings.

### `[TBD-9]` Materialized resource_consumption

Если computed окажется тормозом.

### `[TBD-10]` Формальная шкала оценок

Если потребуется — выделим в `assessments` таблицу.

### `[TBD-11]` Cash-payout рефералов

Когда появится банковский счёт и/или MoR-интеграция для выплат —
расширим `reward_kind` до `cash_payout` и добавим логику payout
(требует bank info юзера — отдельная sensitive data таблица).

### `[TBD-12]` A/B тесты и dynamic pricing на тирах

Если потребуется — `runs.price_amount` уже поддерживает override от tier
base. Нужен слой experiment assignment (per-user / per-cookie) — отдельная
таблица experiments + assignments.

---

## Версионирование документа

- v0.1 — исходная фиксация
- v0.2 — модель programmes/runs, граница D1/KV, админ-панель
- v0.3 — content-as-data, no-hardcode, structure сайта, agent workflow
- v0.4 — модуль как атомарная единица с педагогической длительностью
- v0.5 — замена локали es→ru, M:M связь session↔modules
- v0.6 — разделение архитектуры (свойства) и конфигурации (данные);
  Resources & soft constraints
- v0.7 — групповые сессии и работы, оценки per-student
- **v0.8 — текущая** — тиры как прайс-структура (атрибут programme в
  Content Collection); bundles как отдельная сущность с
  `includes_programmes`; bundle покупка = 1 payment + N enrollments;
  публичные цены до регистрации; промо-коды (своя таблица, применение
  на нашей стороне до MoR); реферальная система (`users.referral_code`
  + `referrals` таблица, MVP reward = `discount_on_next`); D1 → 17 таблиц
- v0.8.1 — убран Drizzle ORM из стека. БД делаем сами: нативный D1
  API через Worker binding, SQL-миграции через `wrangler d1 migrations`,
  TS-типы пишем вручную рядом со схемой. Zod остаётся — он про
  валидацию runtime API-входа, не про БД.
- **v0.8.3 — текущая** — JWT keys rotation system: таблица `jwt_keys`
  (active/deprecated/revoked) + `MASTER_SECRET` (env, AES-GCM
  encrypt/decrypt signing keys в БД) + `KV_CACHE` namespace. Порт из
  `~/git/301/`. D1: 19 → 20 таблиц.
- v0.8.2 — auth model overhaul: multi-method auth через
  `auth_methods` table (password + N OAuth identities per user);
  OAuth providers Google + Discord на старте (расширяемо); JWT 15min
  + refresh-session в D1; PBKDF2-SHA256 600k iter; Discord без email
  отклоняется; native Astro endpoints (без Hono); field type
  conventions формализованы. D1: 17 → 19 таблиц.
- v0.9 — после полной детализации D1 (`[TBD-2]`) для остальных таблиц
- v1.0 — готов к Sprint 0
