# Instructor LK v2 — Batch 2

> Status: active. Утверждено пользователем 2026-06-08 после прохода
> по всем discovery-вопросам Q1..Q10.
>
> **В батче:** Q1 + Q3 + Q4 + Q5 + Q6 + Q9 + ET-fix.
> **Deferred:** Q7, Q8.
> **Reuse:** Q10 (timezone уже в `/account`, не делаем отдельный
> `/instructor/account`).
>
> Каждый этап = отдельный commit. Деплой — один в конце.

---

## S1 — ET timezone fix (bugfix перед фичами)

`migrations/0009_apply_flow.sql:36, 229-230` фиксирует: все live-сессии
в `America/New_York` (FLOW-26). UI показывает ET всегда, не зависит от
timezone пользователя. `time_et` в slots хранит час по ET отдельно.

**Bug:** `CohortCard.astro:57` и `cohorts/[id].astro` matrix-drawer
вызывают `Intl.DateTimeFormat` **без `timeZone: 'America/New_York'`**.
Сейчас время локализуется браузерным TZ — для preпода/студента в МСК
показывается +7h от реального ET.

**Fix:** добавить `timeZone: 'America/New_York'` во все session-time
formatters + добавить суффикс "ET" в label чтобы у пользователя не
было сомнений.

**Затронуто:**
- `src/components/instructor/CohortCard.astro:57` — nextSessionFmt
- `src/pages/[locale]/instructor/cohorts/[id].astro` — matrix drawer
  отображение session/submission времён
- `src/components/dashboard/SubmissionCard.astro:40` — student-side
  submission dates (этот возможно не sessions а submitted_at — TBD)
- Другие места которые grep по `Intl.DateTimeFormat` покажет

**Acceptance:** "Thu, Jun 11, 01:00 PM ET" одинаково для всех браузерных
TZ (verified через playwright с emulated timezone).

---

## S2 — Q6: ConfirmModal вместо browser confirm()

`/instructor/cohorts/[id]` matrix drawer: кнопки Grant override /
Revoke override используют `confirm("...")`. Native-диалог некрасив и
не настраивается.

**Заменить на:** in-page `<dialog>` (или custom overlay с focus-trap):
- Header: "Grant override for {student} on {module}?"
- Body: 1-line explanation что произойдёт
- Buttons: Cancel / Confirm (Confirm с amber-fill)
- Submitting state на Confirm пока fetch
- Close на Esc + клик на backdrop

Вынести в `src/components/shared/ConfirmModal.astro` (потенциально
переиспользуемый в admin).

**Acceptance:** клик "Grant override" → открывается dialog → Confirm →
fetch → UI обновляется без reload.

---

## S3 — Q1: `/instructor/homework` queue page

Одна страница со ВСЕМИ pending submissions от всех студентов по всем
cohorts. Главный "work today" view preпода.

**Структура:**
- Hero: "Pending submissions" + count
- Filter chips (re-use CohortFilters паттерн):
  - by cohort (multi)
  - by programme (multi)
  - "Only late" toggle
- Список строк:
  ```
  {student name} · {programme · cohort badge} · {module title}
  {submitted_at relative} · [late badge]
  ```
- Sort: priority DESC → submitted_at ASC (старшие сверху)
- Click row → `/instructor/homework/[id]` (existing)
- No pagination (LIMIT 50 в helper'е)

**Server:** helper `listInstructorPendingQueue(env, instructorId)` —
JOIN submissions + enrollments + applications + cohorts.

**Файлы:**
- `src/pages/[locale]/instructor/homework/index.astro` (new)
- `src/lib/server/instructor-homework.ts` — добавить
  `listInstructorPendingQueue`
- В `InstructorNav` добавить `Queue` ссылку

**Acceptance:** preподa видит все pending от 14 тестовых студентов
сразу, может отфильтровать по cohort/late, клик → review page.

---

## S4 — Q4: `/instructor/students` (+ детальный `/students/[id]`)

### S4a — list

`/instructor/students` — таблица всех студентов preподa.

**Колонки:**
- Name
- Cohort (badge с programme color)
- Programme
- Current module
- Progress (% завершённых модулей)
- Pending count (this student × this instructor)

**Filter chips:** by cohort (multi), by programme (multi)
**Sort:** by progress / pending / name (toggle headers)

**Server:** helper `listInstructorStudents(env, instructorId)`.

**Файл:** `src/pages/[locale]/instructor/students/index.astro` (new).

### S4b — detail

`/instructor/students/[id]` — профиль студента + timeline.

**Содержание:**
- Header: name, email, cohort, programme, joined date
- Progress timeline: модули с status (done/active/locked/pending/needs_revision)
- Recent submissions: last 10 строк со ссылками на review
- (Опционально) "Send message" CTA — отложим до Q3/email-flow

**Server:** `getInstructorStudentDetail(env, instructorId, studentUserId)`
(ACL: студент должен принадлежать одному из cohorts preпода).

**Файл:** `src/pages/[locale]/instructor/students/[id].astro` (new).

**Nav:** в `InstructorNav` добавить `Students` ссылку.

**Acceptance:** preподa видит список всех 14 студентов с filter,
переход в детальный профиль показывает их прогресс по модулям.

---

## S5 — Q5: `/instructor/sessions` (расписание)

Список занятий — что было / что будет. Список (не календарь).

**Секции:**
1. **Upcoming** — все будущие sessions preпода (ASC по scheduled_at, без лимита, но в реальности <30)
2. **Past** — прошедшие (DESC, LIMIT 30)

**Row format:**
```
{date weekday HH:MM ET} · {cohort badge} · {module title}
                       [Join] (если в zoom-window)
                       [Recording] (если past + recording_url)
```

**Filter chips:** by cohort (multi)

**Server:** helper `listInstructorSessions(env, instructorId)` —
SELECT sessions JOIN cohorts JOIN slots WHERE
slot.instructor_id = ? OR cohort lead_instructor.

**Файлы:**
- `src/pages/[locale]/instructor/sessions/index.astro` (new)
- `src/lib/server/instructor-sessions.ts` (new helper module)

**Nav:** добавить `Schedule` ссылку.

**Без edit** — изменения расписания через admin.

**Acceptance:** preподa видит ближайшие 2 sessions (Thu Jun 11
beginner + intermediate) и past пусто (наши тестовые cohorts только
начались).

---

## S6 — Q9: Daily digest

Утренний email со сводкой preподa.

**Trigger:** Cloudflare Cron Trigger или внутренний cron endpoint
(уже есть `/api/internal/cron/run`).
**Schedule:** ежедневно 13:00 UTC = 09:00 EDT (фикс ET, **не**
timezone preпода — отложено до Q10v2).

**Recipients:** все instructors с
`u.role IN ('instructor') AND u.digest_opt_in = 1`.

**Email body:**
- Subject: "Today: {N} pending · {M} sessions"
- Body sections:
  - Pending (top 10, остальные "+12 more, see queue")
  - Late submissions (top 5)
  - Today's sessions (with join links если в window)
- CTA: "View queue" / "View schedule"

**Opt-out:** в `/account` toggle "Email digests" (новое поле).

**Server:**
- Migration: `users.digest_opt_in INT DEFAULT 1`
- Helper `sendInstructorDigest(env, instructorId)` — выбирает данные,
  рендерит email body, вызывает `sendEmail`
- Cron handler dispatcher (если ещё нет) — каждое утро прогон.

**Файлы:**
- `migrations/NNNN_digest_opt_in.sql` (new)
- `src/lib/server/instructor-digest.ts` (new)
- `src/pages/api/internal/cron/digest.ts` или интеграция в существующий
  cron endpoint
- `src/pages/[locale]/account.astro` — toggle "Email digests"
  (нужно посмотреть текущую структуру)

**Acceptance:** ручной trigger через cron endpoint посылает email
preподу с правильным контентом.

---

## Out of scope (deferred)

- **Q3** — Review page enhancements: pain points не названы, защёлкнем
  по реальной usage. Если что-то срочно бьёт — отдельный мини-стейдж.
- **Q7** — Compose UI for individual programmes: ждём пока появятся
  Individual cohorts с реальными студентами.
- **Q8** — Multi-cohort handling: filter chips уже решают для 2-3
  programmes. Защёлкнем когда добавится Advanced или станет 5+.

## Lifecycle

После всех 6 этапов:
1. Build + production deploy одним wrangler-вызовом.
2. Verify через playwright по каждому acceptance criterion.
3. `git mv .agent/plans/active/instructor-lk-v2-batch2.md
   .agent/plans/done/` отдельным коммитом.
