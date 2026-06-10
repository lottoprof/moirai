# Cohort Conflict Policy — Discussion Plan

> Status: active (discussion). Поднято 2026-06-08 после mock seed
> второго instructor'а (nastya). Принципиальные ответы зафиксируем
> в decisions_archive + закодим в admin/instructor flow.
>
> Цель: исключить ambiguity при назначении instructors/cohorts/sessions
> в условиях когда возможны временные конфликты.

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

**TBD.**

### Q2. Конфликт на уровне session (substitute времени)

Когда возникает:
- Admin assign sessions.substitute_instructor_id = Y, а у Y уже есть
  session в той же дате/часе (в любом cohort'е как lead или substitute).

**Варианты:** A/B/C аналогично Q1.

**TBD.**

### Q3. Конфликт slot vs slot (parallel cohorts разных slot'ов)

Когда два разных slot'а имеют пересекающееся time/days + один и тот же
instructor:
- `lottoprof: Mon/Thu 09:00 ET`
- `lottoprof: Tue/Thu 09:00 ET` (overlap на Thu 09:00)

**Варианты:**
- **A.** Запрет на уровне DB constraint: instructor может иметь только
  один slot per programme per day.
- **B.** UI warn при создании/редактировании slot'а.
- **C.** Нет ограничений; решается per session через substitute.

**TBD.** Это пока теоретический сценарий (живых таких slot'ов нет).

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

**TBD.** Зависит от bundle apply UX.

### Q5. Перенос session'ы (rescheduled)

Что если admin переносит одну session (status='rescheduled') на новое
время, которое конфликтует с lead'ом / substitute'ом / students?

- Сейчас: status можно ставить, но conflict не проверяется.

**Варианты:** A/B/C.

**TBD.**

### Q6. Минимальный gap между sessions (rest time)

Должен ли preподa иметь минимум N минут между live-sessions? Например
не больше двух 60-min sessions подряд без 30-min перерыва.

**Варианты:**
- **A.** Не enforce — admin решает.
- **B.** Hard rule: ≥30 min gap, иначе UI блокирует.
- **C.** Per-instructor config: instructor задаёт свой минимум в
  `/account` (Q10 dependency).

**TBD.**

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

**TBD.**

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

**TBD.**

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

**TBD.** Возможно нужен один primary view + drill-down.

## Что обсудить и как фиксировать

После обсуждения каждого Q:
1. Зафиксировать ответ (A/B/C/custom) в этом файле.
2. Кратко в `.agent/rules/decisions.md` (одна строка manifest).
3. Полный context — `.agent/rules/decisions_archive.md`.
4. Implement через отдельный план или прямо в `admin-instructor-management`
   batch 2.

## Lifecycle

После всех Q ответов и implementation → `git mv` в done/.
