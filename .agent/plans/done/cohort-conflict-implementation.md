# Cohort Conflict Policy — Implementation

> Status: done (code merged). Sprint 1 закрыт 2026-06-12 (S1-S8 все
> commits). Production deploy + migration apply — отдельно.
>
> Sprint 1 work для 9 решений зафиксированных в
> `.agent/plans/done/cohort-conflict-policy-discussion.md` + полные
> записи в `.agent/rules/decisions_archive.md` § 2026-06-11.

## Roadmap (порядок выполнения)

Стейджи отсортированы по зависимостям. Где явно сказано "Sprint 2" —
не делаем сейчас, фиксируется как deferred.

### S1 — Migration: новые поля (Q8 + Q6 constant)

**Migration `00NN_cohort_public_priority.sql`:**
```sql
ALTER TABLE cohorts ADD COLUMN public_priority INTEGER;
ALTER TABLE cohorts ADD COLUMN public_label TEXT;
```

**`src/lib/config/lk.ts`:** добавить
```ts
export const MIN_INSTRUCTOR_REST_MIN = 30;
```

**`db/types.ts`:** расширить `CohortRow` optional полями
`public_priority?: number | null`, `public_label?: string | null`.

Acceptance:
- `pnpm typecheck` зелёный
- migration apply --local не падает

### S2 — Helpers: расширение conflict window до rest period (Q6 + Q2)

Файлы: `src/lib/server/admin-instructors.ts`.

- В `findQualifiedInstructors.conflictWindow` расширить расчёт до
  `[scheduled_at - MIN_INSTRUCTOR_REST_MIN*60, scheduled_at + sessionDur + MIN_INSTRUCTOR_REST_MIN*60]`.
  Параметр sessionDur зашиваем как 60 min пока нет per-module override.
- В `/admin/cohorts/[id]` substitute dropdown UI — передать
  conflictWindow при вызове `findQualifiedInstructors` (сейчас нет).

Acceptance:
- substitute dropdown показывает `*` для занятых per Q1/Q2 pattern
- `pnpm typecheck` + `pnpm lint` зелёные

### S3 — Helper: `findInstructorSlotConflicts` + slot validation (Q3)

Новый helper:
```ts
findInstructorSlotConflicts(env, instructorId, days[], timeEt): Promise<SlotRow[]>
```

Возвращает existing slots того же instructor'а где day/time пересекается.

**Slot create/edit UI** (TBD location — где admin создаёт slots) —
вызывает helper перед submit. Если non-empty → hard block с ошибкой
"У этого preподa уже есть slot {label} в {day} {time}".

Acceptance:
- POST/PATCH slot с конфликтом возвращает 422 / "slot_conflict"
- UI показывает конкретный конфликтный slot

### S4 — Apply flow refactor для parallel cohorts (Q8)

Когда admin создал 2 cohorts beginner на одну дату:

**Apply page** (`src/pages/[locale]/apply/*`):
- Группировать cohorts по `(programme, start_date, time_et)`
- Показывать как "Group A / Group B / Group C" (label = `public_label`
  если задан, иначе index по `public_priority` ASC NULLS LAST)
- Hide instructor names

**Checkout** (`src/pages/[locale]/checkout.astro` + соотв. API):
- Backend выбирает cohort при confirm: ORDER BY public_priority ASC
  NULLS LAST, paid_count ASC, id (deterministic round-robin)

**/admin/cohorts/[id]:**
- Добавить поля редактирования `public_priority` + `public_label`

Acceptance:
- 2 parallel cohorts видны на /apply как "Group A / Group B"
- При checkout backend выбирает по priority/load
- Admin может изменить priority через UI

### S5 — Reschedule endpoint + UI integration (Q5)

Новый endpoint `POST /api/admin/sessions/[id]/reschedule`:
```json
Body: { scheduled_at: number }
Response 200: { conflicts: [{ kind: 'lead'|'sub'|'student', user_id, session_id }] }
```

Soft warn: возвращает 200 даже с конфликтами; UI показывает их и просит
подтверждение (через 2-step submit `?confirm=1`).

UI — пока через `/admin/cohorts/[id]` session row → "Reschedule" button
с modal. Полноценная calendar UI — S7.

Acceptance:
- POST принимает new datetime, обновляет sessions.scheduled_at
- Conflicts возвращаются в response
- Modal показывает их и блокирует submit без confirm

### S6 — Handover каскад на future sessions (Q7)

Изменить `/api/admin/users/[id]/handover` — после batch UPDATE cohorts:
```sql
UPDATE sessions SET substitute_instructor_id = NULL,
                    updated_at = unixepoch()
 WHERE substitute_instructor_id = ?
   AND scheduled_at > unixepoch();
```

Acceptance:
- Handover preподa X очищает future sessions где он substitute
- Past sessions с `substitute_instructor_id = X` сохраняются

### S7 — Admin calendar (FullCalendar v6) (Q9)

**WebFetch CF Workers static asset size limit** перед installation
(per cf-free-tier.md hard-rule).

Новая страница `/admin/calendar`:
- FullCalendar v6+ vanilla JS adapter (без React/Vue)
- View toggle: week / month / quarter
- Events: все sessions + slots-template на горизонте
- Color: per programme через `--prog-beginner / --prog-intermediate /
  --prog-advanced` CSS vars (уже в tokens.css)
- Click event → opens `/admin/cohorts/[id]` в drawer
- Drag event → calls S5 reschedule endpoint

Bundle ~80kb gzip — приемлемо для admin-only страницы.

Acceptance:
- /admin/calendar показывает все sessions next 3 months
- Drag session на новую дату → reschedule modal с conflict warning
- Цвета per programme

### S8 — docs/Architecture.md update

Описать в § Instructor management:
- Q3 hard block constraint + helper
- Q6 MIN_INSTRUCTOR_REST_MIN constant
- Q7 handover каскад
- Q8 parallel cohorts display + priority
- Q9 calendar UI

Plus update manifest строки в decisions.md если будут уточнения после
реальной implementation.

## Deferred (Sprint 2)

Не делаем в этом батче:
- Q1/Q2/Q5 hybrid block (threshold обсудим когда появятся данные)
- Q4 bundle checkout warning (нет реальной bundle sale пока)
- Q6 per-instructor config (если потребуется override)

## Implementation order

```
S1 (migration + constant)
   ↓
S2 (helpers extension) — независим от S3-S6
   ↓
S3 (slot validation)   ←  параллельно с S5/S6
   ↓
S4 (apply flow)
   ↓
S5 (reschedule API)
   ↓
S6 (handover cascade) — независим от S5
   ↓
S7 (calendar UI) — использует S5 endpoint
   ↓
S8 (docs)
```

Каждый стейдж = отдельный коммит. Один production deploy в конце
с применением migration.

## Lifecycle

После всех S1-S8 → `git mv` плана в `done/`. Decision archive остаётся
в `.agent/rules/decisions_archive.md` § 2026-06-11.
