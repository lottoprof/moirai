# Per-session meeting override UI

> Создан 2026-06-13. Endpoint уже задеплоен (`PATCH
> /api/instructor/sessions/[id]/meeting`), UI отложен — edge case,
> используется только при substitute-сценарии или разовой смене
> комнаты для одной сессии.

## Контекст

Cohort-level meeting setup готов: препод заполняет `cohort.meeting_url`
+ `meeting_host_url` + `meeting_provider` на `/{locale}/instructor/cohorts/[id]`.
Эти значения используются для всех session'ов когорты по умолчанию.

Однако есть кейсы когда нужен **override на одну конкретную сессию**:
- Substitute преподаёт со своим Zoom-room.
- Особый формат session — guest lecturer со своей платформой.
- Тестовое занятие на другом мерч-классе с разовой комнатой.

Схема уже поддерживает: `sessions.meeting_url` + `meeting_host_url`
(migration 0011). Resolution chain в UI:
```
session.meeting_url ?? cohort.meeting_url
```

## API готов

```
PATCH /api/instructor/sessions/[id]/meeting
Body: { meeting_url?: string|null, meeting_host_url?: string|null }
ACL:  lead_instructor_id OR substitute_instructor_id = user.id
```

Note: provider на session-уровне нет (наследуем от cohort).

## Что добавить в UI

### Где

`/{locale}/instructor/sessions/index.astro` — страница «Расписание»,
уже показывает upcoming + past sessions в виде списка с `Join`-кнопкой
если zoomActive.

### Как

Под каждой строкой upcoming session добавить **expandable form**
(через `<details>` или toggle button + inline div):

```
Сессия пн, 15 июн., 09:00 ET · Beginner · Module title
[Подключиться]         [Изменить ссылку ▾]
                       ┌──────────────────────────────────┐
                       │ Платформа: Zoom (от группы)      │
                       │ Join URL: [             ]        │
                       │ Host URL: [             ]        │
                       │ [Сохранить] [Сбросить override] │
                       └──────────────────────────────────┘
```

Текст «от группы» — пометка что provider унаследован. Кнопка
«Сбросить override» — PATCH с `meeting_url: null` + `meeting_host_url:
null` → resolution chain снова берёт из cohort'ы.

### Визуальный indicator

В строке session показать badge «Custom link» если
`session.meeting_url` non-null. По default — наследует cohort'у.

## Шаги реализации

1. Расширить `listInstructorSessions` (`src/lib/server/instructor-sessions.ts`)
   так чтобы возвращала отдельно:
   - `session_meeting_url` / `session_meeting_host_url` (raw для form)
   - `cohort_meeting_url` / `cohort_meeting_host_url` (raw для placeholder)
   - `is_override` boolean (если session.meeting_url IS NOT NULL)
   - `meeting_join_url` (computed final — уже есть)

2. UI в `/instructor/sessions/index.astro`:
   - Per-row toggle «Изменить ссылку» (только upcoming)
   - Inline form с pre-filled значениями (если override уже стоит)
   - Save + Reset buttons
   - Status feedback inline
   - Badge «Custom link» на строках с override

3. JS handler:
   - PATCH `/api/instructor/sessions/[id]/meeting`
   - Pre-fill: при open form читать current value
   - Reset: PATCH с `{ meeting_url: null, meeting_host_url: null }`
   - После success — обновить inline display + badge

## Тестирование

После имплементации:
1. Открыть `/{locale}/instructor/sessions` под lottoprof.
2. Найти ближайшую session.
3. Click «Изменить ссылку» → expanded form, поля пустые (нет override).
4. Заполнить URL → Save → status «Сохранено» + badge «Custom link».
5. Reload — badge остался, form pre-fills with override URL.
6. Click «Сбросить override» → form очистилась + badge ушёл.
7. Reload — session.meeting_url=NULL, `Join`-кнопка берёт URL из
   cohort.meeting_url.

## Не делать

- Provider override per-session — наследуем от cohort, незачем.
- Bulk edit (override 5 sessions сразу) — overkill пока.
- Substitute сам не редактирует — пусть это делает lead, substitute
  скажет какой URL поставить.

## Lifecycle

Когда UI задеплоен + проверен:
1. `git mv .agent/plans/active/instructor-session-meeting-override.md .agent/plans/done/`
2. Commit с пометкой `plan: session-meeting-override → done`.
