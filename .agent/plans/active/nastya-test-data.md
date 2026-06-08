# Nastya Test Data Plan

> Mock test data для **второго** instructor'а (Anastasiia Zasypkina).
> Параллельно к lottoprof тестовым группам, для проверки 2-instructor
> setup (qualifications matrix, cohort assignment, handover etc).
>
> **План создаётся ДО вставок** — все ID зафиксированы в
> `scripts/seed/nastya-test-data.json`. При cleanup гадать не надо.

## Scope (2026-06-08)

**Две группы test students для nastya:**
- **Group 1 — Beginner:** 6 новых студентов
- **Group 2 — Intermediate:** 7 новых студентов + `test-student@moiraionline.pro` (existing) = **8 total**

Total: **13 новых users** (вместо 14 как у lottoprof — потому что
существующий test-student переиспользуется в group 2).

**Cohorts открыты** (не запущены). Поэтому **НЕТ submissions** —
курсы стартуют 2026-07-14 / 2026-07-28, модулей ещё не активно.

## Existing IDs (read-only)

| Поле | UUID |
|---|---|
| nastya `user_id` | `7586e8da-38d8-4e43-9f01-4d96d1af174d` |
| test-student `user_id` (existing user) | `87abbb2d-bcf7-4c88-9228-99cfb75e8a2a` |
| beginner slot (Tue/Fri 09:00 ET) | `1e2ee7f5-df5f-a44a-8e65-03346b6ca27e` |
| beginner cohort (start 2026-07-14, OPEN) | `813b85be-5604-b3f9-bedd-9b49b9c610fe` |
| intermediate slot (Tue/Fri 09:00 ET) | `830ff1f3-d3b2-7edd-bd52-ff3733cb6088` |
| intermediate cohort (start 2026-07-28, OPEN) | `d6329765-dd2b-6836-51a4-decaa972ebfc` |

## Новые UUIDs

Все UUIDs зафиксированы в **`scripts/seed/nastya-test-data.json`**
(committed). Структура:

```json
{
  "users": [{ "n": 1, "id": "..." }, ..., { "n": 13, "id": "..." }],
  "enrollments": [...],     // 14 rows (6 beginner + 8 intermediate)
  "applications": [...]     // 14 rows
}
```

**Различие со lottoprof seed:**
- 13 новых users (не 14) — slot test-student'а используется existing user.
- 14 enrollments / applications — потому что test-student тоже получает
  enrollment в intermediate cohort (его enrollment row создаётся отдельно).

User emails: `nastya-student1@moiraionline.pro` ... `nastya-student13@moiraionline.pro`.
User names: `Nastya Student 1` ... `Nastya Student 13`.

(Префикс `nastya-` чтобы visually отличаться от lottoprof'овских
`test-student1..14@moiraionline.pro`.)

## Что создаётся (через apply script)

### Step 1: UPDATE 2 slots → instructor_id = nastya
- `slots[1e2ee7f5...]` (beginner Tue/Fri 09:00)
- `slots[830ff1f3...]` (intermediate Tue/Fri 09:00)

### Step 2: UPDATE 2 cohorts → lead_instructor_id = nastya
Прямой UPDATE на 2 выбранные cohorts (не trigger каскад через slot,
чтобы не задеть другие cohorts этих slot'ов).
- `cohorts[813b85be...]` (beginner)
- `cohorts[d6329765...]` (intermediate)

### Step 3: 13 новых users + user_roles
- 13 INSERT в `users` (email_verified, locale=en, no auth methods)
- 13 INSERT в `user_roles` (role='student')

### Step 4: 14 enrollments
- Group 1 (6): programme='beginner', cohort=`813b85be`, lead=nastya, price=$399
- Group 2 (8):
  - 7 новых: programme='intermediate', cohort=`d6329765`, lead=nastya, price=$499
  - 1 для test-student@: то же

### Step 5: 14 applications (status='paid')
- 1 application per enrollment, linked через enrollment_id FK

### Step 6: enrollment_modules
- Group 1: 6 × 11 modules = **66 rows**
- Group 2: 8 × 13 modules = **104 rows**
- Total: 170 rows

### Step 7: НЕТ submissions
Cohorts ещё не стартовали (Jul 14, Jul 28 в будущем). Студенты пока
не сдавали ДЗ. Запретили генерацию submissions.

## Expected результат

**`/instructor` overview для nastya (logged in as Anastasiia Zasypkina):**
- Cohorts grid: 2 cohorts с lead=nastya + остальные cohorts из её 2 slots'ов
- 2 cohorts с реальными метриками:
  - Beginner cohort `813b85be` (Jul 14, 2026 open): 6 students, 0 pending, 0 reviewed, 0 late
  - Intermediate cohort `d6329765` (Jul 28, 2026 open): 8 students, 0 pending
- Карточки status=open → нет блока "Next session" (поведение filter
  для empty/open cohorts уже задеплоено).

**`/instructor/cohorts/813b85be...`:**
- 6 students × 11 modules matrix, все cells "locked"
  (потому что cohort.status='open', start_date > now, нет sessions
  в unlock window)

**`/admin/users/[test-student@]/`:**
- В drawer должна показаться его новая Enrollment (Intermediate)
  под new "Enrollments" секцией.

## Apply / Cleanup

```bash
# Dry-run preview
node scripts/seed/nastya-test-data.mjs --remote --dry-run

# Apply (production)
node scripts/seed/nastya-test-data.mjs --remote

# Cleanup (rollback всё)
node scripts/seed/nastya-test-data.mjs --remote --cleanup

# Local (для dev testing)
node scripts/seed/nastya-test-data.mjs --local
node scripts/seed/nastya-test-data.mjs --local --cleanup
```

Cleanup в правильном порядке FK:
1. DELETE enrollment_modules (по enrollment_id IN ...)
2. DELETE applications (по id IN ... ВСЕ 14 включая test-student'а)
3. DELETE enrollments (по id IN ... ВСЕ 14)
4. DELETE user_roles (только 13 новых, НЕ test-student)
5. DELETE users (только 13 новых)
6. UPDATE cohorts → lead_instructor_id = NULL (только 2 выбранные)
7. UPDATE slots → instructor_id = NULL (только 2 выбранные)

## Production safety

- **R2 files НЕ создаются** — нет submissions, нечего хранить.
- **No password methods** — test users не могут залогиниться.
- **No real email** — Resend не triggered.
- **test-student@ НЕ удаляется при cleanup** — это existing real user.
  Только его enrollment row из этой seed удалится.
- **`idempotency_key`** не нужен (нет submissions).
- **Префикс `nastya-`** в email — отличие от lottoprof'овских test-student'ов.

## Notes для будущей чистки

При финальной чистке test environment:
```bash
node scripts/seed/nastya-test-data.mjs --remote --cleanup
```

Один command удаляет всё. JSON остаётся в репо как audit trail.

Если потеряли JSON — fallback грубый cleanup:
```sql
DELETE FROM users WHERE email LIKE 'nastya-student%@moiraionline.pro';
-- + manual cleanup for test-student@'s enrollment in d6329765 cohort
-- + UPDATE slot/cohort instructor → NULL
```
