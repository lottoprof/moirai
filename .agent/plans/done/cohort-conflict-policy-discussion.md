# Cohort Conflict Policy — Discussion (closed)

> Status: done (decisions). Закрыто 2026-06-11 после прохода по 9 Q.
> Полные записи решений с альтернативами и причинами — в
> `.agent/rules/decisions_archive.md` § 2026-06-11.
> Implementation работы — отдельным планом
> `.agent/plans/active/cohort-conflict-implementation.md`.
>
> Цель discussion-фазы: исключить ambiguity при назначении
> instructors/cohorts/sessions в условиях возможных временных конфликтов.

## Background

- **Cohort даты immutable** (decided 2026-06-08, user: "Новые когорты —
  плюс к текущим"). Existing cohorts не пересчитываются.
- **Auto-publish cohorts отменён** (decided 2026-06-10). Admin сам
  отвечает за учебную сетку и публикует cohorts вручную через
  /admin/cohorts UI. Причина: новый instructor может быть на временной
  замене / испытательном — auto-сетка не покрывает эти кейсы.
- **Параллельные cohorts разрешены** (different slots, same time).
- `findQualifiedInstructors` уже умеет `conflictWindow` — отмечает
  `available=false` для занятых preподов, но **не блокирует**.

## Открытые вопросы

### Q1. Конфликт на уровне instructor (один lead в двух cohorts одновременно)

Когда возникает:
- Admin assign cohort.lead_instructor_id = X, а у X уже есть live-session
  в другой active cohort в overlapping time window.

**Варианты:**
- **A.** Soft warn (текущее поведение). Show `*` в dropdown, admin сам решает.
- **B.** Hard block. UI не даёт submit, требует substitute.
- **C.** Hybrid: warn для один-два конфликта (acceptable), block если >50%
  будущих sessions конфликтуют.

**Decision (2026-06-11): A → C.** Sprint 1 оставляем soft warn (как
сейчас работает). Hybrid block добавим во втором сезоне, когда увидим
evidence что conflicts случайно прокрадываются. Threshold (1-2 vs >50%)
обсудим тогда.

### Q2. Конфликт на уровне session (substitute времени)

Когда возникает:
- Admin assign sessions.substitute_instructor_id = Y, а у Y уже есть
  session в той же дате/часе (в любом cohort'е как lead или substitute).

**Варианты:** A/B/C аналогично Q1.

**Decision (2026-06-11): A → C** (повторяет Q1). Sprint 1 — soft warn
через тот же `conflictWindow` параметр findQualifiedInstructors,
передавать его в substitute dropdown `/admin/cohorts/[id]`. Hybrid block
на Sprint 2.

**Implementation note:** в `/admin/cohorts/[id]` substitute dropdown
сейчас вызывает helper БЕЗ conflictWindow — нужно добавить при
implementation Sprint 1.

### Q3. Конфликт slot vs slot (parallel cohorts разных slot'ов)

Когда два разных slot'а имеют пересекающееся time/days + один и тот же
instructor:
- `lottoprof: Mon/Thu 09:00 ET`
- `lottoprof: Tue/Thu 09:00 ET` (overlap на Thu 09:00)

**Варианты:**
- **A.** Запрет на уровне DB constraint: instructor может иметь только
  один slot per (day_of_week, time_et). Constraint per-instructor —
  разные instructors могут иметь одинаковые time/days (параллельные
  группы).
- **B.** UI warn при создании/редактировании slot'а.
- **C.** Нет ограничений; решается per session через substitute.

**Decision (2026-06-11): A** — структурные конфликты блокируем. Constraint
per-(instructor_id × day × time_et). Это **разрешает** 2 параллельные
группы с одной программой в один час если разные instructors (lottoprof
Mon 09:00 + nastya Mon 09:00 — OK, новый учитель → новая параллельная
группа).

**Implementation note:** `slots.days_json` — JSON array (e.g.
`["mon","thu"]`). UNIQUE на JSON-колонке невозможен напрямую. Варианты:
- (i) Доп. таблица `slot_days(slot_id, day_of_week)` + composite UNIQUE
  на (instructor_id × day × time_et) через JOIN trigger.
- (ii) API-level validation: при создании/edit slot'а — helper
  `findInstructorSlotConflicts(env, instructorId, days[], timeEt)`
  проверяет existing slots того же instructor'а.
- Решим (i) vs (ii) при implementation Sprint 1. Скорее всего **(ii)** —
  меньше schema overhead.

### Q4. Конфликт slot vs другие активности (student-side)

Может ли студент быть записан в две cohorts с пересекающимся расписанием?
Сейчас архитектура: один student → ОДИН enrollment per programme (см.
Architecture §). Но student мог купить bundle (beg + int) и быть записан
в два cohort'а — если их sessions пересекаются, физически студент не может
быть в обоих.

**Варианты:**
- **A.** Application flow при покупке bundle гарантирует non-overlapping
  расписание двух cohorts (slot diff).
- **B.** Допускаем overlap, student manually пропускает одну sessions —
  записи доступны post-factum.
- **C.** Warn на checkout если overlap detected.

**Decision (2026-06-11): B.** Допускаем overlap. На checkout показываем
warning ("Sessions Mon 09:00 будут одновременно в двух cohorts. Recording
доступен"), student подтверждает или не покупает. Recording покрывает
edge case, не теряем sales.

**Implementation note:** проверка overlap при checkout (когда student
выбрал две cohorts для bundle), отображение warning перед confirm-payment.
Sprint 1 — отложим до первой реальной bundle sale (сейчас bundle apply
flow не запущен).

### Q5. Перенос session'ы (rescheduled)

Что если admin переносит одну session (status='rescheduled') на новое
время, которое конфликтует с lead'ом / substitute'ом / students?

- Сейчас: status можно ставить, но conflict не проверяется.

**Варианты:** A/B/C.

**Decision (2026-06-11): A → C (Sprint 2 hybrid)** — единый pattern с
Q1/Q2. Sprint 1 — soft warn в reschedule UI (показать конфликты с
lead/substitute/students, admin подтверждает). Hybrid block — Sprint 2,
threshold обсудим тогда (вероятно block для lead-конфликта, warn для
student-конфликта поскольку recording спасает по Q4).

**Implementation note:** reschedule UI пока не существует — только
`sessions.status='rescheduled'` в БД. При implementation первой версии
reschedule action — сразу с soft warn.

### Q6. Минимальный gap между sessions (rest time)

Должен ли preподa иметь минимум N минут между live-sessions? Например
не больше двух 60-min sessions подряд без 30-min перерыва.

**Варианты:**
- **A.** Не enforce — admin решает.
- **B.** Hard rule: ≥30 min gap, иначе UI блокирует.
- **C.** Per-instructor config: instructor задаёт свой минимум в
  `/account` (Q10 dependency).

**Decision (2026-06-11): B.** Hard rule ≥30 min gap между live-sessions
одного instructor'а (lead OR substitute). UI блок в:
- cohort assignment (если новый lead создаёт session-цепочку с gap <30 min
  с другой его cohort'ы)
- session substitute (если substitute даёт <30 min gap с другой sessions)
- reschedule (если новое время даёт <30 min gap)

**Constants:** `MIN_INSTRUCTOR_REST_MIN = 30`. Конфигурируется в
`src/lib/config/lk.ts` если в будущем понадобится изменить или сделать
per-programme.

**Implementation note:** Расширить `findQualifiedInstructors`
conflictWindow логику — она сейчас детектит ровно overlapping sessions,
нужно расширить до `[from - 30min, to + 30min]` для include rest period.

### Q7. Каскад при resignation / handover

Когда admin делает handover preподa (см.
`/admin/users/[id]/handover` — already shipped):
- ВСЕ his active cohorts передаются новым leads
- НО — что с sessions у которых уже задан substitute_instructor_id = он?
  Нужно ли substitute_instructor_id тоже сбрасывать?

**Варианты:**
- **A.** Substitute остаётся. Admin отдельно решает.
- **B.** Substitute сбрасывается → NULL → используется новый cohort lead.
- **C.** Hybrid: substitute остаётся ТОЛЬКО для уже прошедших sessions
  (audit), будущих — clear.

**Decision (2026-06-11): C.** Hybrid — substitute_instructor_id остаётся
для past sessions (audit trail: видно что X реально подменял),
очищается для future sessions (новый lead покрывает, защищаем от silent
failure в день session'ы когда X уже уволен).

**Implementation note:** в `/api/admin/users/[id]/handover` batch UPDATE
после установки нового cohort lead — добавить:
```sql
UPDATE sessions SET substitute_instructor_id = NULL, updated_at = unixepoch()
 WHERE substitute_instructor_id = ?
   AND scheduled_at > unixepoch()
```
Past sessions не трогаем. Применяется только к сессиям того cohort'а где
handover-target был lead — но проще делать глобально по
substitute_instructor_id (если уволился, везде убираем).

### Q8. Display параллельных cohorts клиенту в apply flow

Возникает при ручной публикации: admin поставил **2 cohorts beginner**
с одинаковой start_date и time (e.g., Mon Sep 14, 09:00 ET), но разные
slots + разные instructors (lottoprof vs nastya).

Клиент на странице apply / checkout видит "Beginner — Mon Sep 14, 09:00 ET" —
КАК он выбирает? Сейчас apply flow подразумевает одну cohort per
(programme + start_date) комбинацию.

**Варианты:**
- **A.** Показывать обе с instructor name + bio link
  ("Mon Sep 14, 09:00 ET — instructor: lottoprof" / "... nastya").
  Клиент выбирает по preподу.
- **B.** Прятать instructor от клиента, показывать только slot label
  ("Group A" / "Group B"). Admin назначает instructor скрытно.
- **C.** Round-robin: показываем ту в которой меньше paid_count.
  Клиент не видит выбор. Минус: admin теряет контроль над балансом.
- **D.** Гибрид: показываем обе без имён, но при checkout backend
  выбирает менее заполненную (или ту что admin приоритизировал).

**Decision (2026-06-11): D.** Клиент не видит instructor names — это
работает и для сценария "instructor нанялся и уволился до старта":
admin меняет lead другого preподa, клиентская ожидание не нарушено
(никогда не знал, кто будет вести).

**Implementation note:**
- Apply UI показывает cohort'ы как "Group A / Group B / Group C" (label
  на основе DB поля `cohorts.public_label` или просто index per
  (programme, start_date)).
- При checkout/apply confirm — backend выбирает cohort по правилу:
  (i) admin priority (новое поле `cohorts.public_priority` INT NULL —
  чем меньше число, тем выше показывается; NULL = в конце);
  (ii) round-robin по paid_count если priority равны.
- Migration: добавить `cohorts.public_priority INT NULL` и опционально
  `cohorts.public_label TEXT NULL` (override "Group A"). Admin задаёт
  через /admin/cohorts/[id].

### Q9. Admin UI: calendar view для учебной сетки

Текущий /admin/cohorts — table. Для управления параллельными cohorts
нужен **календарь** (week / month / quarter view).

**Варианты:**
- **A.** FullCalendar-style: каждая sessions = event, drag-resize.
  Многоцветный per programme. Click — открывает cohort detail.
- **B.** Простой grid week × time-slot. Каждая ячейка = N cohorts на
  этом slot. Click → list.
- **C.** Quarter-level: per-month grid с cohort cards. Меньше детализации
  но проще для overview.

**Decision (2026-06-11): A.** FullCalendar для полного контроля над:
- session-level reschedule (drag event → new datetime, triggers Q5 soft
  warn flow с conflict check)
- visual gap detection (Q6 ≥30 min rest легко увидеть)
- handover preview (Q7 — admin видит все sessions преподa перед
  /admin/users/[id]/handover submit)
- priority management (Q8 — drag вертикально для admin priority order)

**Implementation note:**
- FullCalendar v6+ vanilla JS adapter (без React/Vue). Bundle ~80kb gzip.
- Цветовая кодировка: programme-cohorts через CSS vars
  (--prog-beginner amber-light, --prog-intermediate sage, --prog-advanced
  rust — уже в tokens.css).
- Initial view: week. Toggle month / quarter — secondary.
- Click event → opens existing `/admin/cohorts/[id]` detail в drawer
  или новой странице.
- Drag event → reschedule API (новый endpoint POST
  `/api/admin/sessions/[id]/reschedule` с soft warn payload).

**CF free tier sanity** (HARD-RULE per cf-free-tier.md): FullCalendar — 
client-only lib, static asset через Pages. Workers Free лимиты не задеты
(только bundle size в client cache). Pre-implementation: WebFetch CF
Workers static asset size limit (вроде 25MB total).

## Что обсудить и как фиксировать

После обсуждения каждого Q:
1. Зафиксировать ответ (A/B/C/custom) в этом файле.
2. Кратко в `.agent/rules/decisions.md` (одна строка manifest).
3. Полный context — `.agent/rules/decisions_archive.md`.
4. Implement через отдельный план или прямо в `admin-instructor-management`
   batch 2.

## Lifecycle

Discussion-фаза закрыта 2026-06-11 — план переходит в `done/`.
Implementation — отдельный план
`.agent/plans/active/cohort-conflict-implementation.md`.
