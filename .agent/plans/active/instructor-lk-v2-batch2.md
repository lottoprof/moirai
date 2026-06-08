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

## TODO: S7 — Cron trigger Worker (для Q9 digest)

**Status:** не блокер для текущего deploy (S6 digest код inert до
появления trigger'а), но обязателен прежде чем digest начнёт реально
отправляться preподам.

**Why separate Worker:** CF Pages не поддерживает `[triggers]` нативно
(https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
Нужен **отдельный CF Worker** который раз в N мин hit'ает Pages endpoint
`/api/internal/cron/run?job=<X>` с CRON_SECRET.

**CF Free tier:** **5 cron triggers per account**
(https://developers.cloudflare.com/workers/platform/limits/). Используем
**1 trigger** через time-aware dispatcher → 4 запас.

**Структура:**

```
cron-worker/
  wrangler.toml
  src/index.ts
```

**wrangler.toml:**

```toml
name = "moirai-cron"
main = "src/index.ts"
compatibility_date = "2026-05-01"
workers_dev = false

[vars]
PAGES_BASE_URL = "https://moiraionline.pro"

[triggers]
crons = ["*/15 * * * *"]
```

**src/index.ts:**

```typescript
export interface Env {
  PAGES_BASE_URL: string;
  CRON_SECRET: string;
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date(event.scheduledTime);
    const hr = now.getUTCHours();
    const min = now.getUTCMinutes();

    // Каждые 15 мин: auto-approve
    ctx.waitUntil(callJob(env, "auto-approve"));

    // Daily jobs на минуте 0 каждого нужного часа (UTC)
    if (min === 0) {
      if (hr === 3)  ctx.waitUntil(callJob(env, "retention"));
      if (hr === 4)  ctx.waitUntil(callJob(env, "pre-archive-email"));
      if (hr === 5)  ctx.waitUntil(callJob(env, "orphan-cleanup"));
      if (hr === 13) ctx.waitUntil(callJob(env, "instructor-digest"));
    }
  },
};

async function callJob(env: Env, job: string): Promise<void> {
  const url = `${env.PAGES_BASE_URL}/api/internal/cron/run?job=${encodeURIComponent(job)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  if (!res.ok) {
    console.error(`[cron-worker] job=${job} status=${res.status} body=${await res.text()}`);
  }
}
```

**Deploy:**

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm exec wrangler secret put CRON_SECRET --config cron-worker/wrangler.toml
# (вставить то же значение что в Pages secret)

pnpm exec wrangler deploy --config cron-worker/wrangler.toml
```

**Trade-off:** Все daily jobs привязаны к UTC. instructor-digest 13:00
UTC ≈ 09:00 EDT (8:00 EST зимой). Это глобальный момент для всех
preподов — не зависит от их personal timezone. Подходит per Q10
reuse `/account` (timezone preпода НЕ применяется к delivery time).

## Lifecycle

После всех 6 этапов:
1. Build + production deploy одним wrangler-вызовом.
2. Verify через playwright по каждому acceptance criterion.
3. `git mv .agent/plans/active/instructor-lk-v2-batch2.md
   .agent/plans/done/` отдельным коммитом.
