# Instructor ЛК v2 — Discovery (pre-spec)

> Рабочий документ **перед** ТЗ. Параллельный к `student-lk-v2-discovery.md`.
> Многие решения уже зафиксированы в Student LK v2 — здесь покрываем
> только instructor-side flow.
>
> Источник: stage21 (текущая `/instructor/index.astro` с STUB),
> `Architecture.md §Instructor zone` (planned routes), решения
> `student-lk-v2-discovery.md` (homework review flow, override
> unlock, ACL, retention).
>
> Проходим по одному пункту — обсуждение → решение в **Решение** →
> ставим `[x]`. По завершении — переносим в финальный spec.

---

## 0. Что зафиксировано в Student LK v2 — наследуем без обсуждения

Перенесено из `student-lk-v2-discovery.md`, instructor-side следует
этим решениям:

| Решение | Источник | Что значит для инструктора |
|---|---|---|
| Homework status enum | Q1 student | ставит `approved` / `needs_revision`, видит `auto_approved` / `pending` |
| Resubmit история | Q1+Q2 student | видит **все** попытки студента, не только последнюю |
| Comment обязателен на `needs_revision` | Q2e student | UI блокирует submit без коммента |
| Annotated copy опциональная | Q2d student | upload button, не required |
| `priority='low'` на resubmit после approved | Q2.C review | в queue можно фильтровать/игнорировать |
| Instructor override unlock | Q1.A review | нужен UI для этого action |
| ACL — lead_instructor видит только свои enrollments | Q2.H review | queries фильтрованы |
| Pre-signed URL pattern для annotated upload | Q2a student | тот же flow что у студента |
| Phosphor Thin icons | Q9 student | используем те же компоненты |
| `STUDENT_LK_CONFIG` | Q1 student | все timing/limits оттуда |

---

## 1. Видимые дыры в текущем `/instructor` (D)

Найдены при чтении stage21 кода.

- [ ] **D1. `stub.pending` — 4 mock cards.** `instructor/index.astro:77-82`.
      Реальная queue из `homework_submissions` появится после Student
      LK v2 schema.
      **Решение:** _обсуждаем (закрытие через Q1)_

- [ ] **D2. Stub metrics:** `awaitingReview=5`, `reviewedThisWeek=8`,
      `avgReviewMin=18`, `oldestDays=3`. `instructor/index.astro:73-76`.
      Реальные через query поверх `homework_submissions`.
      **Решение:** _обсуждаем (закрытие через Q2)_

- [ ] **D3. Stub `nextSession`** (Mon May 18 18:00 UTC, hardcoded).
      `instructor/index.astro:83-87`. После Student Q4 (sessions table)
      берётся из D1.
      **Решение:** _обсуждаем (закрытие автоматом)_

- [ ] **D4. `StudentRow.href = "#"` / `HwQueueCard.href = "#"`.**
      Ссылки никуда не ведут. Нужны `/instructor/students/[id]` и
      `/instructor/homework/[id]`.
      **Решение:** _обсуждаем (Q3 + Q4)_

- [ ] **D5. Нет `/instructor/homework` (queue).** Sidebar / nav-item
      "Homework" — куда ведёт?
      **Решение:** _обсуждаем (Q2)_

- [ ] **D6. Нет `/instructor/homework/[id]` (review).** Single most
      critical page для instructor workflow.
      **Решение:** _обсуждаем (Q3)_

- [ ] **D7. Нет `/instructor/students` + `[id]` detail.**
      "Все мои студенты" с прогрессом и actions.
      **Решение:** _обсуждаем (Q4)_

- [ ] **D8. Нет `/instructor/sessions`.** Список upcoming + past
      sessions cohort.
      **Решение:** _обсуждаем (Q5)_

- [ ] **D9. Нет UI для instructor override unlock** (Q1.A student
      review). Действие должно жить где-то — per student или per module.
      **Решение:** _обсуждаем (Q6)_

- [ ] **D10. Юникод-эмодзи в `instructor/*` файлах** — проверить.
      `feedback_no_unicode_icons` применяется и здесь.
      **Решение:** _bugfix вместе с Q9 student_

---

## 2. Открытые вопросы (Q)

### Q1. Homework queue — структура `/instructor/homework`

**Контекст.** Основной workflow преподавателя — пройти queue pending
submissions, проверить, поставить статус, оставить feedback.
В overview (`/instructor`) — мини-card pending (4 штуки), но full
queue нужна на отдельной странице.

**Подвопросы:**

- **Q1a. Фильтры:**
  - cohort (для preподa с 2+ cohorts)
  - module
  - status (`pending` / `needs_revision` / `approved` / `auto_approved`)
  - priority (`normal` / `low`)
  - late (`is_late=true`)
- **Q1b. Сортировка:** по `uploaded_at` ASC (oldest first — справедливо)?
  Или DESC (newest first — психологически быстрее)? Или по
  `next_session.scheduled_at` (то что горит первым)?
- **Q1c. Bulk actions:** select multiple → approve все as approved?
  Полезно для теоретических модулей где ДЗ — формальность.
  Или это противоречит решению "approved требует ручного review"?
- **Q1d. Per-student grouping:** показывать submissions сгруппированными
  по студенту (видно весь его прогресс сразу) или плоский список
  по дате?
- **Q1e. Pagination или infinite scroll или всё сразу:** для cohort
  10 студентов × 12 модулей = max 120 active rows, но активно
  `pending` обычно < 20. Pagination overkill?

**Решение:** _обсуждаем_

- [ ] Q1 закрыт

---

### Q2-expansion. Overview = cohorts с динамикой ДЗ + Zoom join

**Закрыт 2026-06-08.**

Overview reworked: вместо плоского queue + stats row — **grid из cohort
cards**. Top stats row убран (cohort cards несут эти числа per-cohort).

**Q2e — содержание cohort card:**
- Programme name + label из start_date
  ("Starts Jun 15, 2026" для open, "Started Jun 1, 2026" для running)
- Status badge (open / running / completed / cancelled)
- N active students (`COUNT enrollments WHERE cohort_id AND status='active'`)
- **Три метрики ДЗ (все):**
  - Pending review (status='pending' AND priority='normal')
  - Reviewed this week (reviewed_by=me AND reviewed_at >= week_start)
  - Late submissions (is_late=1 AND status='pending')
- Next live session (MIN sessions.scheduled_at WHERE > now AND
  status='scheduled')
- Zoom join CTA (active за `LK_CONFIG.zoom_join_window_minutes_before`
  = 15 минут до session)

Click на card → `/instructor/cohorts/[id]` (Q11 matrix view).

**Q2f — Zoom URL:**
- Для preподa: `cohort.meeting_host_url ?? cohort.meeting_url` (host
  если есть, иначе join). Per-session override через
  `sessions.meeting_host_url`/`sessions.meeting_url` (с тем же fallback).

**Layout: Variant A — Grid cards** (не Hero + list).

### Q2. Overview `/instructor` — реальные данные

**Контекст.** Stub'ы → real queries. Уже частично сделано (cohorts,
my_students). Остальное привязано к D2/D3.

**Подвопросы:**

- **Q2a. Stats card "Reviewed this week":** считаем submissions где
  `reviewed_at BETWEEN week_start AND now AND reviewed_by = current_user`?
  Считать ли `auto_approved` (не его review)? Я думаю — не считать
  (это не его работа).
- **Q2b. Stats card "Avg review min":** considered нагрузочной метрикой,
  но не очевидно как считать time-to-review. Может быть `avg(reviewed_at
  - uploaded_at)` для submissions последнюю неделю — но это включает
  weekends + sleeping hours. Реалистично — оставить эту stat или
  заменить на что-то более practically useful?
- **Q2c. "My students" — где ссылка ведёт:** /instructor/students
  (list) или /instructor/students/[id] (per student) для каждой row?
- **Q2d. "Next session":** ближайший session где
  `current_user = cohort.lead_instructor_id`. Что показывать кроме
  даты + module? Кнопка "Open Zoom"? Кнопка "View module"?

**Решение:** _обсуждаем_

- [ ] Q2 закрыт

---

### Q3. Review page `/instructor/homework/[id]`

**Контекст.** Главный workflow page. Препод открыл submission, должен:
- Скачать / посмотреть оригинал (file_r2_key через signed GET URL).
- Прочитать `student_comment` (если был).
- Решить status.
- Опционально написать `instructor_comment` (markdown, обязательно
  на `needs_revision`).
- Опционально upload annotated copy.
- Submit → status set + email + badge to student.

**Подвопросы:**

- **Q3a. Layout:** two-column (file preview слева, form справа)?
  Или single-column (file сверху, form снизу)?
- **Q3b. File preview:**
  - Video — Vidstack player.
  - PDF — `<iframe>` или browser native.
  - Image — `<img>`.
  - Doc/xlsx/text — Download only?
- **Q3c. History of student's submissions for this module** —
  показывать prior attempts? Если да — как (collapsed list above /
  sidebar)?
- **Q3d. LLM pre-fill (future):** место в layout для draft. Сейчас
  не делаем, но layout должен быть готов.
- **Q3e. Submit redirect:** после submit куда? Назад в queue
  (`/instructor/homework`) или в next pending submission (queue
  auto-advance)?
- **Q3f. Keyboard shortcuts:** `A` для approve, `R` для
  needs_revision? Или избыточно?
- **Q3g. Student context на review page:** показывать имя студента,
  его avatar, link на `/instructor/students/[id]`?

**Решение:** _обсуждаем_

- [ ] Q3 закрыт

---

### Q4. Students page `/instructor/students` + `[id]`

**Контекст.** Список enrollments где `lead_instructor_id = current_user`.
Уже частично — overview показывает первые 4-8 в mini-table.

**Подвопросы:**

- **Q4a. List page:** аналогичная таблица overview, но полная.
  Фильтры (cohort / programme / status)?
- **Q4b. Per-student page `/instructor/students/[id]`:** что показывает:
  - Profile basic info (name, email, joined).
  - Cohort + programme.
  - Все модули с status (done / current / locked).
  - История ДЗ submissions (link to review pages).
  - Action: instructor override unlock (Q6).
  - Action: cancel enrollment?
  - Notes from instructor (private)?
- **Q4c. Communication:** instructor может отправить direct message
  студенту? Or только через homework comment + email?
- **Q4d. Private instructor notes per student:** "Anna стесняется, не
  давить на feedback". Полезно для smooth handoff если cohort
  передадут другому instructor'у. Делаем или нет?

**Решение:** _обсуждаем_

- [ ] Q4 закрыт

---

### Q5. Sessions page `/instructor/sessions`

**Контекст.** После Student Q4 — есть таблица `sessions` per cohort.
Препод хочет видеть свои upcoming + past sessions.

**Подвопросы:**

- **Q5a. Структура:** список upcoming + past с фильтром по cohort?
  Или calendar view?
- **Q5b. Per-session actions:**
  - Edit `notes` (admin internal — может быть и instructor?).
  - Cancel session (это admin?). Или request cancel?
  - Reschedule (admin only?).
- **Q5c. Recording link** — мы зафиксировали что не делаем recordings
  (Q4 student), но если admin вручную вставит URL — instructor видит?

**Решение:** _обсуждаем_

- [ ] Q5 закрыт

---

### Q11. Cohort detail page `/instructor/cohorts/[id]`

**Контекст (lottoprof, 2026-06-07):** при клике на cohort из overview —
открывается detail page со студентами **поимённо** и **матрицей: что
открыто кому** (per student × per module status).

**Подвопросы:**

- **Q11a. Layout:** таблица student × module (rows = students,
  columns = modules) с cell content (done / current / locked /
  override icons)? Или вертикальный список students с inline
  expandable module strip?
- **Q11b. Cell click action:** клик на ячейку → submission detail
  (если есть submission) или per-student page? Или ничего (read-only
  matrix)?
- **Q11c. "Открыто кому" indicator:** Phosphor Thin lock icon для
  locked, check для done, ring/dot для current, override-mark для
  manual unlock.
- **Q11d. Sort:** по имени студента, по last activity, по progress %?
- **Q11e. Cohort actions:** edit cohort.zoom_url, view sessions list
  (jump to Q5), bulk announce (Sprint 2+).

### Q6. Instructor override unlock — где живёт UI

**Контекст.** Q1.A student зафиксировал колонки `unlock_override_*`
в `enrollment_modules`. UI для action — не определён.

**Варианты:**

1. **Per-student page** (`/instructor/students/[id]`): список модулей,
   у каждого — кнопка "Unlock now" (если locked) или метка "Override
   by you on DD-MM".
2. **Per-module per-cohort page** (`/instructor/modules/[slug]`):
   список всех студентов cohort'ы, у каждого — current status + кнопка
   override.
3. **В обоих местах:** студент-centric + module-centric — гибче, но
   дублирует.

**Подвопросы:**

- **Q6a. UI action flow:** modal с **обязательным confirmation
  ("чтобы по ошибке не открыть закрытый модуль" — lottoprof)** +
  опц. reason field. Кнопка disabled пока не подтвердил.
- **Q6b. Audit:** override логируется в audit_log? Да — это action
  с consequences.
- **Q6c. Undo:** препод может отменить override (UPDATE
  unlock_override_at = NULL)? Или one-way? Я бы дал undo с тем же
  confirmation modal.
- **Q6d. Warning copy:** "Studенту X будет открыт доступ к модулю Y
  до запланированной даты Z. Вы уверены?" + "[ ] Я понимаю, что
  это override schedule".

**Решение:** _обсуждаем_

- [ ] Q6 закрыт

---

### Q7. Instructor compose UI (individual programmes)

**Контекст.** Architecture.md упоминает
`/instructor/students/[id]/compose` для individual programmes —
instructor добавляет/убирает модули постфактум.

**Подвопросы:**

- **Q7a. В MVP делаем или нет?** Individual programme сейчас зафиксирован
  как `slug='individual', price=0 или deposit, initially 0 модулей`.
  Кейс реалистичный или сначала ждём первого individual student?
- **Q7b. Если делаем — UI:** drag-and-drop из catalog в enrollment'a?
  Или multi-select checkboxes?
- **Q7c. Цена пересчитывается на лету или fixed deposit?**

**Решение:** _обсуждаем_

- [ ] Q7 закрыт

---

### Q8. Multi-cohort инструктор

**Контекст.** Preпод может вести 2+ cohorts одновременно (Beginner-A
и Intermediate-B параллельно). Что меняется в UI?

**Подвопросы:**

- **Q8a. Aggregate queue** — все pending submissions across cohorts
  в одну /instructor/homework? Фильтр по cohort? (Q1a уже).
- **Q8b. Switch cohort context** — нужен global cohort-switcher в
  nav? Или фильтр на каждой странице?
- **Q8c. Stats per cohort или aggregate?** Reviewed this week для
  всех cohorts вместе?

**Решение:** _обсуждаем_

- [ ] Q8 закрыт

---

### Q9. Уведомления — instructor side

**Контекст.** Student Q2f зафиксировал: preпод **не получает email**,
только in-app badge на queue. Возможно надо уточнить.

**Подвопросы:**

- **Q9a. Daily digest email** для preпода: "5 submissions awaiting,
  2 late, oldest 3 days" — дисциплинирующий nudge. Делаем или нет?
- **Q9b. Per-event email** — точно не. Подтвердить.
- **Q9c. In-app badge на каких страницах:** только nav-item Homework?
  + main overview hero?

**Решение:** _обсуждаем_

- [ ] Q9 закрыт

---

### Q10. Instructor `/account`

**Контекст.** Сейчас `/account` для всех ролей через dynamic Layout
(см. `pages/[locale]/account.astro`). Управление auth methods —
общее.

**Подвопросы:**

- **Q10a. Bio editing:** instructor может править собственное bio
  для `/instructors/[slug]` public page? Или это admin-only?
- **Q10b. Notification preferences (Q9):** opt-in/out для daily digest
  если делаем (Q9a).
- **Q10c. Auto-replies / template snippets:** preзаготовленные
  comments "Great work" / "Please reshoot scene 3" / "Audio issues
  noted". Полезно для скорости review. Делаем или нет?

**Решение:** _обсуждаем_

- [ ] Q10 закрыт

---

## 2.5. Consistency check vs Student LK v2 (2026-06-07)

Прогон каждого решения student-lk-v2 на конфликт с предполагаемым
instructor flow. **Блокирующих противоречий нет.** Найдено 3 expansion
items — потенциальные новые поля, не противоречия.

| Student LK v2 решение | Instructor side | Status |
|---|---|---|
| Homework status enum (pending/needs_revision/approved/auto_approved) | Ставит approved/needs_revision вручную, видит pending в queue, auto_approved как отдельный label | ✓ consistent |
| Resubmit history (1 row per upload) | Видит все попытки в /students/[id] и review page | ✓ consistent |
| Priority='low' на resubmit после approved | Фильтр в queue, можно игнорировать | ✓ consistent |
| Auto-approve cron только pending + on-time | Метрика "% manual review" в overview | ✓ consistent |
| Annotated copy опциональная | Кнопка upload в review page, не required | ✓ consistent |
| Instructor override unlock columns | UI в Q6 + Q11 cohort matrix | ✓ consistent |
| Sessions table (1:1 module mapping) | Q5 sessions list | ✓ consistent |
| Lead instructor ACL | Все queries фильтрованы | ✓ consistent |
| Retention 30 days + curriculum_feedback анонимно | После archival instructor видит только curriculum corpus | ✓ consistent |
| Student tabs/drawer/presentation mode | InstructorLayout — отдельная nav, не наследует | ✓ consistent |
| Phosphor Thin icons | Те же компоненты | ✓ consistent |
| STUDENT_LK_CONFIG | Instructor reads same config | minor: переименовать в `LK_CONFIG` (shared) |

### Expansion items (новые подвопросы, не противоречия)

**E1. Zoom host vs join URL.**

Q4 student зафиксировал `cohort.zoom_url` (join link для студентов).
Препод для start meeting нуждается в **host link** (другой URL,
требует Zoom account login). Возможные решения:

a. **Single URL**, instructor использует тот же что student — Zoom
   recognise host по login.
b. **Separate `cohort.zoom_host_url`** + `cohort.zoom_url` (join).
   Instructor видит host, students видят join.

Не блокирует student MVP, **добавляется при имплементации instructor
overview**. Зафиксировать в Q2-expansion.Q2f.

**E2. Auto-approved stat в instructor overview.**

После Q1 student — `auto_approved` существует как separate status.
Метрика дисциплины preпода: процент manual vs auto. Полезно показать
в instructor overview как stat card:
"Reviewed manually: 8 · Auto-approved (missed): 3 (27%)".

Это **новое поле в overview**, не схема. Добавляется в Q2.

**E3. GDPR delete request marker для instructor view.**

Q10 student зафиксировал `enrollments.gdpr_delete_requested_at`
(on_completion mode — студент остаётся в cohort'е, но flag set).
Инструктор видит этот flag в /students/[id]? Маркер "будет удалён
после completion" — полезный context.

Добавляется в Q4 instructor.

### Заключение

Instructor LK v2 **логически совместим** со Student LK v2 решениями.
Все expansion items — добавочные UI / schema колонки, не conflict.

**Можно возвращаться к Student LK v2 ТЗ** и нарезать stages.
Instructor discovery остаётся в `active/` для будущего раунда после
Student MVP в проде.

---

## 3. Что НЕ обсуждаем в этом раунде

- Cohort assignment / management — это **admin** workflow.
- Programme management — methodist / admin.
- Refunds / payments — admin only.
- Cohort cancellation — admin.
- Co-instructors (multi-instructor per cohort) — отложено в Future
  migrations (текущая модель single lead_instructor).
- Public instructor profile page (`/instructors/[slug]`) — не в LK,
  а в public zone.
- Live session UI inside Zoom (Web SDK embed) — vne scope (Zoom external).

---

## 4. Future migrations / planned upgrades

Параллельно с student-lk-v2 § 5 — instructor-specific:

### Co-instructors per cohort

`cohort_instructors(cohort_id, user_id, role: 'lead'|'co')`.
Расширение Q2.H ACL.

### Calendar view для sessions

Q5 — если list view окажется неудобным, добавим month calendar.

### LLM pre-check для homework review

Q3.D — уже зафиксировано в Student Q1 (колонки `llm_draft_*`).
UI integration — отдельный stage.

### Mass feedback templates

Q10.C — preзаготовленные comment snippets per instructor / global.

### Per-student private notes

Q4.D — если препод запросит.
