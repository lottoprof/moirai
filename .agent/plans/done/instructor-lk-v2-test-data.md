# Instructor LK v2 — Test Data Plan

> Mock test data для проверки `/instructor` overview (Q2-expansion) +
> `/instructor/cohorts/[id]` matrix (Q11) на production D1.
>
> **План создаётся ДО вставок** — все ID зафиксированы в
> `scripts/seed/instructor-test-data.json`. При cleanup гадать не надо.

## Scope (lottoprof, 2026-06-08)

**Два группы test students:**
- **Group 1 — Beginner:** 6 студентов, на module 3 (beg-03 текущий)
- **Group 2 — Intermediate:** 8 студентов, на module 4 (int-04 текущий)

Total: 14 mock users.

## Existing IDs (read-only)

| Поле | UUID |
|---|---|
| `instructor_user_id` (lottoprof) | `556fc3b2-930d-4739-b55d-f14fc284ef47` |
| `beginner_slot_id` (Mon/Thu 09:00 ET) | `148bffa8-0350-ba81-9e67-4bc1feef9ff3` |
| `beginner_cohort_id` (первый) | `1ba36e98-37d2-1827-e229-4a6e7261a2ee` |
| `intermediate_slot_id` (Mon/Thu 09:00 ET) | `e525b9cc-9ba4-6f7a-ecf6-2622e880da7e` |
| `intermediate_cohort_id` (первый) | `27d22323-4596-1724-68f7-fd0c7350c8ac` |

## Новые UUIDs

Все 92 UUIDs зафиксированы в **`scripts/seed/instructor-test-data.json`** (committed).
Структура:

```json
{
  "users": [{ "n": 1, "id": "..." }, ..., { "n": 14, "id": "..." }],
  "enrollments": [...],     // 14 rows, индекс совпадает с users
  "applications": [...],    // 14 rows
  "submissions": [          // 50 rows
    { "student": <n>, "module_idx": <1..>, "id": "..." },
    ...
  ]
}
```

User emails: `test-student1@moiraionline.pro` ... `test-student14@moiraionline.pro`.
User names: `Test Student 1` ... `Test Student 14`.

## Что создаётся (через apply script)

### Step 1: UPDATE 2 slots → instructor_id = lottoprof
- `slots[148bffa8...]` (beginner Mon/Thu 09:00)
- `slots[e525b9cc...]` (intermediate Mon/Thu 09:00)

### Step 2: 14 users + user_roles
- 14 INSERT в `users` (email_verified, locale=en, no password methods)
- 14 INSERT в `user_roles` (role='student')

### Step 3: 14 enrollments
- Group 1 (6): programme='beginner', cohort=`1ba36e98`, lead=lottoprof, price=$399
- Group 2 (8): programme='intermediate', cohort=`27d22323`, lead=lottoprof, price=$499

### Step 4: 14 applications (status='paid')
- 1 application per enrollment, linked через enrollment_id FK

### Step 5: enrollment_modules
- Group 1: 6 × 11 modules = **66 rows** (all 11 beginner modules)
- Group 2: 8 × 13 modules = **104 rows** (all 13 intermediate modules)
- Total: 170 rows

### Step 6: 50 mock homework_submissions
- Group 1: 6 × 3 modules (beg-01, beg-02 done + beg-03 current) = **18 submissions**
- Group 2: 8 × 4 modules (int-01..03 done + int-04 current) = **32 submissions**

**Status variation:**
- Завершённые модули (beg-01, beg-02 / int-01..03) → `approved` (3/4 студентов) или `auto_approved` (1/4)
- Текущий модуль (beg-03 / int-04) → varied по student.n % 3:
  - `pending` (cell = amber dot)
  - `needs_revision` (cell = alert + amber bg)
  - `approved` (cell = check)

## Expected результат

**`/instructor` overview (lottoprof):**
- ~20 cohort cards (cohorts от 2 slots, статусы open/running)
- 2 cohort с реальными метриками:
  - Beginner cohort `1ba36e98`: 6 students, pending counts, ~12 reviewed_week
  - Intermediate cohort `27d22323`: 8 students, pending counts, ~24 reviewed_week
- Остальные cohorts: students=0

**`/instructor/cohorts/1ba36e98...`:**
- 6 students × 11 modules matrix
- Cells: beg-01/02 done, beg-03 varied (pending/needs_revision/approved), beg-04..11 locked

**`/instructor/cohorts/27d22323...`:**
- 8 students × 13 modules matrix
- Cells: int-01..03 done, int-04 varied, int-05..13 locked

## Apply / Cleanup

```bash
# Dry-run preview
node scripts/seed/instructor-test-data.mjs --remote --dry-run

# Apply (production)
node scripts/seed/instructor-test-data.mjs --remote

# Cleanup (rollback всё)
node scripts/seed/instructor-test-data.mjs --remote --cleanup

# Local (для dev testing)
node scripts/seed/instructor-test-data.mjs --local
node scripts/seed/instructor-test-data.mjs --local --cleanup
```

Cleanup в правильном порядке FK:
1. DELETE homework_submissions
2. DELETE enrollment_modules
3. DELETE applications
4. DELETE enrollments
5. DELETE user_roles
6. DELETE users
7. UPDATE slots → instructor_id = NULL

## Production safety

- **R2 files НЕ создаются** — `file_r2_key` указывает на несуществующие
  объекты. Matrix отобразится корректно (metadata only). Download buttons
  в drawer вернут 404 от R2.
- **No password methods** — test users не могут залогиниться
  (auth_methods rows не создаём).
- **No real email** — Resend не triggered, `feedback_email_sent_at` NULL.
- **`[mock]` префикс** во всех `instructor_comment` → легко находить и
  удалять отдельно если нужно.
- **`idempotency_key`** = `test-idem-<8chars>` — повторный apply
  заблокируется UNIQUE constraint (защита от дубликатов).

## Notes для будущей чистки

При финальной чистке test environment:
```bash
node scripts/seed/instructor-test-data.mjs --remote --cleanup
```

Один command удаляет всё. JSON остаётся в репо как audit trail.

Если потеряли JSON — fallback грубый cleanup:
```sql
DELETE FROM users WHERE email LIKE 'test-student%@moiraionline.pro';
```
(cascades через FK — но это hard delete, лучше избегать.)
