# Discord integration — план

> Создан 2026-06-13 из обсуждения после публикации `discord.gg/5gnJ7GWA`
> на `/contact`. На текущий момент в `/contact` только статичный
> invite link — без авто-привязки студентов и канальных ролей.

## Цель

Discord-сервер `Moirai` (`discord.gg/5gnJ7GWA`) становится полноценной
коммуникационной площадкой школы:
- Студенты получают доступ автоматически после оплаты — без ручного
  одобрения admin'ом.
- Каждая cohort'а видит свой приватный канал — без перекрёстных
  обсуждений между группами.
- Преподаватели имеют доступ ко всем cohort-каналам и могут вести
  Office Hours / Stage events прямо в Discord.

## Минимальная структура каналов

```
INFO
  #welcome           — правила, FAQ, ссылки на /contact, /faq
  #announcements     — анонсы когорт, начала сессий
                       (followable: подписчики получат в свой DM)

CLASS
  #beginner-cohort-{date}   — приватный чат каждой beginner-группы
  #intermediate-cohort-{date} — то же для intermediate
  #homework-help            — общий канал для вопросов по ДЗ
  #showcase                 — где постить свои работы

DIRECTING-LOUNGE
  #general           — общий film talk (все участники)
  #resources         — полезные ссылки, статьи
  #off-topic         — флуд

VOICE
  Live Session (voice) — fallback если без Zoom иногда
  Office Hours         — preподовские открытые часы (Stage channel)
```

**Cohort-каналы создаются динамически** при создании когорты в admin —
имя по pattern `#{programme}-cohort-{start_date}` (например
`#beginner-cohort-2026-jul-mon-thu`).

## Роли и доступ

| Роль Discord                            | Кому | Доступ |
|---|---|---|
| `@cohort-{programme}-{start_date}`      | студентам этой когорты | свой cohort-канал |
| `@instructor`                           | preподавателям | все cohort-каналы + Office Hours voice |
| `@admin`                                | админам | все каналы + server settings |
| `@alumni`                               | завершившим программу | архивный доступ к showcase + general |

Сейчас Discord-сервер пустой → не настраивать роли вручную до тех
пор пока не появится bot, который сделает grant'ы программно.

## Что нужно реализовать

### Stage 1 — Provision сервера

- Создать роли через UI: `@instructor`, `@admin`, `@alumni`,
  один тестовый `@cohort-test`.
- Настроить permissions: cohort-каналы скрыты по default'у, видны
  только владельцам роли.
- Enable Community: Welcome Screen + Announcement channels +
  Scheduled Events.
- Server icon: уже сгенерирован `/tmp/moirai-discord-icon.png`
  (1024×1024 PNG из `public/favicon.svg`).

### Stage 2 — Discord API integration

**Auth flow:** student после `apply/contact` опционально линкует
Discord-аккаунт через OAuth (`identify` scope) — сохраняем
`discord_user_id` в `users.discord_user_id` (new column).

**Триггеры (server-side):**

- **Оплата подтверждена** (`application.status='paid'` webhook):
  - Поставить `@cohort-{X}` роль в Discord через
    `PUT /api/v10/guilds/{guild_id}/members/{user_id}/roles/{role_id}`.
  - Если `discord_user_id` пустой — поставить флаг `pending_discord_link`,
    показать prompt в `/dashboard` «свяжи Discord для доступа к чату
    группы».
- **Cohort started** (`cohort.status='running'`):
  - Создать канал `#{programme}-cohort-{date}` через
    `POST /api/v10/guilds/{guild_id}/channels` с permission overrides.
  - Запостить welcome-message c расписанием сессий.
- **Cohort completed** (`cohort.status='completed'`):
  - Архивировать канал (рейтинг 0 в category-archive).
  - Снять `@cohort-X`, поставить `@alumni`.
- **Account deleted** (GDPR):
  - Снять все Discord-роли (kick — опционально, обсудить с user'ом
    что хочет видеть).

**Где живёт код:**

- `migrations/NNNN_discord_link.sql` — `users.discord_user_id`,
  `users.discord_linked_at`.
- `src/lib/server/discord.ts` — wrapper API helpers.
- `src/pages/api/auth/oauth/discord/link.ts` (новый, **не путать** с
  существующим discord-as-auth-provider) — линковка Discord к уже
  залогиненному юзеру.
- `src/pages/api/cron/discord-sync.ts` — periodic reconciliation
  (на случай если webhook падает).

**Биндинги нужны новые:**
- `DISCORD_GUILD_ID` (config) — id сервера Moirai.
- `DISCORD_BOT_TOKEN` (secret) — для server-side API calls.
- `DISCORD_OAUTH_*` — уже есть для login flow, переиспользуем.

### Stage 3 — UX

- В `/dashboard` после оплаты cohort'ы показать карточку «Discord:
  не подключён — связать аккаунт» если `discord_user_id IS NULL`.
- В `/instructor/cohorts/[id]` — кнопка «Открыть канал группы в
  Discord» с deeplink `discord://channels/{guild_id}/{channel_id}`
  fallback на `https://discord.com/channels/...`.
- В `/admin/cohorts/[id]` — статус «Discord channel: created» (или
  «pending» / «failed»), manual «Create now» кнопка для retry.

## Не делать пока

- **Server Discovery** (публичный список Discord-серверов) — нужно
  только когда вырастем >1000 участников.
- **Discord-нативная оплата** (Discord recently launched server
  monetization) — параллельный платёжный путь, не вписывается в
  наш Stripe/Lemon Squeezy flow.
- **Discord-Twitter integration** — крутой паттерн (cross-post
  анонсов), но низкий приоритет.

## Лимиты Discord API (важно!)

Discord имеет rate limits per route (typically 5 req/sec). При
batch создании каналов на каждый новый cohort'ы — должно влезать.
Но **обязательно** WebFetch актуальные лимиты перед coding'ом:
- https://discord.com/developers/docs/topics/rate-limits
- https://discord.com/developers/docs/resources/guild#modify-guild-channel-positions

## Зависимости

- Этот план **блокируется** существованием test cohort'ы с реальным
  студентом (test-student@). Сейчас seed-данные не идут через apply
  flow → нет точки, где webhook `application paid` может сработать.
- Альтернатива: ручной admin endpoint «assign Discord cohort role» для
  bootstrap-тестов.

## Open questions

1. Привязка Discord должна быть **обязательной** или опциональной?
   - Pro обязательной: гарантированный доступ к чату cohort'ы.
   - Con: friction в onboarding'е, GDPR (хранение discord_user_id).
2. Как обрабатывать студентов которые НЕ хотят Discord?
   - Email-only режим → но тогда нет cohort-чата → ниже engagement.
3. Если cohort стартует с 1 студентом — создавать ли канал?
   - Минимум 2-3 студента может быть triggered'ом.

## Ссылки

- Текущий invite: `https://discord.gg/5gnJ7GWA`
- Server icon: `/tmp/moirai-discord-icon.png` (генерируется из
  `public/favicon.svg` через inkscape + ImageMagick).
- `/contact` уже линкует invite (deployed 2026-06-13).
