# Student LK v2 — Stage B: Sessions + unlock refactor

> Spec: `docs/student-lk-v2-spec.md` § 8 Stage B.
> Depends on: Stage A (schema + migrations applied, types updated).

## Цель

Заменить sequential unlock (stage26) на schedule-based unlock с
attribute schedule (sessions.scheduled_at) + instructor override.
Удалить "Mark complete" CTA. Adapt module page и dashboard overview.

После Stage B — existing functionality продолжает работать с новой
schema (workbook_r2_key вместо body_r2_key, без `homework_md`).

## Чеклист

### B1 — Helper getUnlockState

- [ ] **B1a.** Создать `src/lib/server/unlock.ts`:
  - `getUnlockState(env, enrollmentId, moduleSlug, now?)` →
    `{ unlocked: bool, reason: 'schedule'|'override'|'first'|'past',
       unlockAt: number | null, sessionScheduledAt: number | null }`.
  - Логика:
    - SELECT `enrollment_modules.unlock_override_at` + JOIN на sessions.
    - Если `unlock_override_at != NULL` → `unlocked: true, reason: 'override'`.
    - Иначе compute `unlockAt = session.scheduled_at − LK_CONFIG.unlock_lead_hours * 3600`.
    - `unlocked = now >= unlockAt`.
- [ ] **B1b.** Создать `src/lib/config/lk.ts` с `LK_CONFIG` const (см. spec § 7).

### B2 — Refactor student-modules.ts

- [ ] **B2a.** Helper `listEnrollmentModules(env, enrollmentId, locale)`:
  - JOIN enrollment_modules + modules (workbook_r2_key) + module_progress +
    sessions (для unlock check).
  - Compute unlock через getUnlockState (или inline JOIN).
  - status: `done | active | locked` (Stage 26 enum но семантика
    refactored — `done` теперь определяется через homework_submissions
    или session.scheduled_at + 1h для теоретических).
- [ ] **B2b.** Helper `getModuleForStudent(env, userId, slug, locale)`:
  - SELECT modules (workbook_r2_key + presentation_r2_key).
  - Ownership check через enrollments.
  - Unlock check через getUnlockState.
  - Если locked → return `null` (info-hiding).
- [ ] **B2c.** Helper `getCurrentEnrollmentProgress(env, userId)`:
  - SELECT first unlocked non-done module.
  - Если все unlocked done → return `{ allCaughtUp: true,
    nextUnlockAt: number | null }` для "All caught up" card (B5).
- [ ] **B2d.** УДАЛИТЬ `markModuleComplete` helper.
- [ ] **B2e.** УДАЛИТЬ `markModuleOpened` старый, заменить на новый
  helper `markModuleViewed` (Stage 26 ставил `in_progress`, Stage B
  ставит `viewed`).
- [ ] **B2f.** Helper `getModuleCompletion(env, enrollmentId, moduleSlug)`:
  - Для теоретического (has_homework=0): `done if now > session.scheduled_at + 1h`.
  - Для практического: `done if exists approved/auto_approved homework_submission`.

### B3 — Удалить Mark complete UI + endpoint

- [ ] **B3a.** УДАЛИТЬ `src/pages/api/student/modules/[slug]/complete.ts`.
- [ ] **B3b.** В `src/pages/[locale]/dashboard/modules/[slug].astro`:
  - Убрать footer "Mark complete" button + inline `<script>`.
  - Убрать i18n keys `markCompleteCta`, `alreadyDone`.

### B4 — Update module page на workbook + presentation

- [ ] **B4a.** В `dashboard/modules/[slug].astro`:
  - Использовать `module_.workbook_r2_key` вместо `body_r2_key`.
  - Описание ДЗ теперь часть workbook'a (секция `## Домашнее задание`)
    — НЕ показывать отдельным блоком `module_.homework_md`.
  - Render через `marked` остаётся, файл fetch через
    `env.MODULE_CONTENT.get(module_.workbook_r2_key)`.
- [ ] **B4b.** Stage B не делает tabs (это Stage E). Workbook
  показывается как сейчас (single page).
- [ ] **B4c.** Late enrollment edge case: если student joined после
  cohort start, backward modules уже unlocked (sessions.scheduled_at
  прошли) — работает auto через schedule.

### B5 — Dashboard overview updates

- [ ] **B5a.** В `dashboard/index.astro` paid view:
  - "Continue" card → берёт из `getCurrentEnrollmentProgress`.
  - Если `allCaughtUp: true` → показать "All caught up" card вместо
    Continue (новый компонент `AllCaughtUpCard.astro`).
- [ ] **B5b.** Late enrollment banner:
  - Если cohort.start_date < enrollment.enrolled_at — показать notice
    "Cohort already in progress. Caught-up materials available. Next
    live session: <date>".
- [ ] **B5c.** Module grid: использует обновлённый `listEnrollmentModules`.
  Locked модули показывают дату открытия + summary (B6).

### B6 — Locked module display detail (Q1.B review)

- [ ] **B6a.** Module card для locked:
  - Title + summary + "Откроется DD MMM HH:mm".
  - НЕ показываем objectives/concepts.
- [ ] **B6b.** Pre-payment teaser (`pp-module-stub`) обновляется
  аналогично с date если есть sessions.

### Verify

- [ ] **V1.** `pnpm typecheck` zero errors.
- [ ] **V2.** `pnpm lint` zero errors.
- [ ] **V3.** `pnpm build` зелёный.
- [ ] **V4.** Local dev:
  - Public pages — render OK.
  - `/dashboard` paid view с stub data — рендерится без 500 на module page.

## Не входит

- Tabs Presentation/Workbook/Homework (Stage E).
- Drawer (Stage E).
- Presentation mode (Stage E).
- Homework submission flow (Stage C).
- Instructor override UI (Stage D — но schema поля используются helpers
  для unlock decision).
- Icons replacement (Stage E).

## Git workflow

Каждая логическая группа (B1, B2, B3, B4, B5, B6) — отдельный commit.
После V verify зелёный — финальный rollup commit или просто закрытие.
`git mv` plan в done/ — отдельный commit.

## Critical files

- `src/lib/config/lk.ts` (new)
- `src/lib/server/unlock.ts` (new)
- `src/lib/server/student-modules.ts` (rewrite)
- `src/pages/api/student/modules/[slug]/complete.ts` (DELETE)
- `src/pages/[locale]/dashboard/modules/[slug].astro` (update)
- `src/pages/[locale]/dashboard/index.astro` (update — Continue card +
  late banner + All caught up)
- `src/components/dashboard/AllCaughtUpCard.astro` (new)
- `src/components/dashboard/ModuleCard.astro` (update — locked detail)
