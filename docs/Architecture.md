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

## 5. Модель программ, тиров, bundles и запусков

### Атомарная единица — модуль

Программа состоит из последовательности модулей с педагогическими
атрибутами (id, programme_id, track, order_in_programme,
default_duration_days, requires_homework, has_text, has_video).
Длительность программы — производная.

### Тиры — прайс-структура программы

Каждая программа имеет один или несколько **тиров**: варианты покупки с
разными фичами и ценами. Тиры — атрибут programme в Content Collection:

```yaml
# /src/content/programmes/beginner.{locale}.mdx (frontmatter)
id: beginner
title: 'Beginner'
duration_weeks: 12  # производная, для отображения
tiers:
  - id: self-paced
    name: 'Self-paced'
    base_price_amount: 19900     # центы
    base_price_currency: 'USD'
    features:
      live_sessions: false
      pre_session_corrections: false
      session_recordings: false
      consultations_count: 0
  - id: standard
    name: 'Standard'
    base_price_amount: 36900
    base_price_currency: 'USD'
    features:
      live_sessions: true
      pre_session_corrections: true
      session_recordings: true
      consultations_count: 1
  - id: premium
    name: 'Premium'
    base_price_amount: 56900
    base_price_currency: 'USD'
    features:
      live_sessions: true
      pre_session_corrections: true
      session_recordings: true
      consultations_count: 3
      priority_feedback: true
```

**features** — открытое множество, состав определяют методисты и админы.
Ключи в `features` используются на странице программы для рендера
сравнительной таблицы и в Worker'е для проверок доступа (`assertAccess`
смотрит `tier.features.live_sessions`, etc.).

### Запуск (`run`) — материализация tier во времени

`runs` содержит `tier_id` — snapshot ссылка на тир из Content Collection
на момент создания. Если методист потом изменит фичи или цену тира —
уже стартовавший run сохраняет свой snapshot.

```sql
runs (
  ...
  programme_id    TEXT NOT NULL,
  tier_id         TEXT NOT NULL,    -- snapshot ссылка
  price_amount    INTEGER NOT NULL, -- snapshot из tier.base_price_amount
                                     -- (или per-run override, например для early-bird)
  ...
)
```

`price_amount` в run по умолчанию = `tier.base_price_amount` на момент
создания, но админ может переопределить при создании (early-bird, специальные
условия для конкретного потока).

### Bundles — пакеты из нескольких программ

Bundle = отдельная сущность, продаётся как самостоятельный продукт. Описание
в Content Collection:

```yaml
# /src/content/bundles/beginner-intermediate.{locale}.mdx
id: beginner-intermediate
title: 'Beginner + Intermediate Bundle'
includes_programmes: ['beginner', 'intermediate']
tiers:
  - id: standard
    name: 'Standard'
    base_price_amount: 74900
    base_price_currency: 'USD'
    savings_vs_separate: 8900     # ($749 vs $369 + $469 = $89 economy)
    features:                       # обычно объединяются с программами в bundle
      priority_feedback: true
      extra_consultations: 2
```

Bundle и programme — **один URL namespace**: `/{locale}/[id]`. Build-time
валидация запрещает совпадение id между Content Collections programmes и
bundles.

### Покупка bundle — несколько enrollments на один платёж

Технически:

1. Студент на странице bundle выбирает тир и нажимает "Купить"
2. На чекауте выбирает конкретные runs из включённых programmes
   (Beginner run X + Intermediate run Y)
3. Создаётся **один** `payments` с `purchase_kind='bundle'`, `purchase_ref='beginner-intermediate'`
4. Создаются **несколько** `enrollments` (по одному на каждую выбранную run)
   с одинаковым `payment_id`

Single-run покупка: 1 payment + 1 enrollment.
Bundle покупка: 1 payment + N enrollments.

### Сессии — гибкая связь со студентами и модулями

Сессия = видеовстреча преподавателя со студентами. Любая комбинация
один-несколько на любой стороне:

- Преподаватель → один или несколько студентов через `session_participants`
- Один или несколько модулей в одной сессии через `session_modules`

Длительность задаётся преподавателем. Три педагогические фазы (Review,
New block, Practice) — структура без жёсткого хронометража. Phase 2
записывается в R2.

### Работы (homework) — индивидуальные или групповые

Работа сдаётся студентом по `run_module`. Может быть индивидуальной или
групповой (общий `group_id` UUID, видео в R2 может быть общим).

**Оценки и фидбэк всегда per-student.** Каждый участник получает свой
feedback и свою оценку (`homework.score`).

### Pre-session corrections (формат C — гибрид)

Преподаватель оставляет timestamp-комментарии и/или общие комментарии на
видео работы до сессии. Технически: `feedback` с `kind` и опциональным
`timestamp_seconds`.

### Что фиксировано в `run`, что подвижно

| Атрибут                  | Где живёт                            | Меняется после старта? |
|--------------------------|--------------------------------------|------------------------|
| programme description    | Content Collection                   | через git+deploy       |
| programme tiers (фичи, цены) | Content Collection               | через git+deploy (для будущих runs) |
| run.tier_id snapshot     | D1 (`runs`)                          | нет                    |
| run.price_amount         | D1 (`runs`)                          | нет (для уже купивших) |
| modules в каталоге       | D1 (`modules`)                        | через админ-UI         |
| тело модуля              | R2                                    | через админ-UI         |
| run_modules расписание   | D1                                    | нет (snapshot)         |
| sessions                 | D1                                    | время; состав модулей; состав участников |
| resource caps            | D1 (`resources`)                     | да, любое время        |
| promo_codes              | D1                                    | да                     |

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

### Личный кабинет (auth required)

```
/{locale}/dashboard                        — overview, ближайшая сессия
/{locale}/dashboard/modules                — список модулей run'а с датами
/{locale}/dashboard/modules/[id]           — модуль: текст и/или видео + prompt
/{locale}/dashboard/sessions               — мои сессии
/{locale}/dashboard/sessions/[id]          — сессия: участники, модули, recording, notes
/{locale}/dashboard/homework               — мои работы и фидбэк
/{locale}/dashboard/homework/[id]          — работа с timestamp-фидбэком
/{locale}/dashboard/account                — профиль, локаль
/{locale}/dashboard/referrals              — мой реферальный код, список приглашённых, статус наград
```

### Админ-панель (role=admin)

```
/admin/login
/admin                            — dashboard
/admin/programmes                 — каталог (модули + атрибуты)
/admin/programmes/[id]/modules    — модули: атрибуты, тело в R2
/admin/runs                       — создание/редактирование запусков (выбор tier + price override)
/admin/runs/[id]/schedule         — материализованное расписание
/admin/runs/[id]/students         — список студентов запуска
/admin/homework                   — очередь домашек (включая групповые)
/admin/sessions                   — расписание: выбор участников и модулей
/admin/users                      — поиск/блокировка
/admin/promo-codes                — создание, активация, деактивация промо-кодов
/admin/referrals                  — обзор реферальной активности, manual award/redeem
/admin/resources                  — capacity ресурсов
/admin/settings                   — KV-настройки
```

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
