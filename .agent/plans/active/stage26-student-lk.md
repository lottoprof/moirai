# Stage 26 — Student ЛК (модули из enrollment + R2 body)

## Контекст

После Stage 14 (Apply flow) у paid-студента в `/dashboard` показывается
stub список модулей. Sprint 1 / Stage 26 заменяет stub реальными
данными:

- D1 metadata модулей уже есть (48 rows, Stage 22)
- R2 bodies уже есть (48 draft files, Stage 22)
- `enrollments` + `enrollment_modules` уже создаются при оплате
  (Stage 14m в `processCheckoutSuccess`)

Stage 26 добавляет:
- Module progress tracking
- Реальный список модулей в `/dashboard` (заменить stub)
- Per-module страница `/dashboard/modules/[slug]` с rendered body
- Sequential unlock (модуль доступен только после done предыдущих)

## Принципы

- **Один SSR-роут на модуль** — не SPA-shell (decisions 2026-05-16)
- Body markdown рендерится через `marked` (lightweight, edge-compat)
- Cache-Control на per-module page: `private, max-age=300` (paid контент,
  не делим между users; короткий cache для редактирования methodist'ом)
- Progress autosave: не нужен для MVP, методист отметит вручную через
  кнопку "Mark complete" в UI

## Этапы

- [ ] **26a** — Migration `0010_module_progress.sql`:
  - `module_progress` (enrollment_id, module_slug, locale, status, last_seen_at, completed_at)
  - PK `(enrollment_id, module_slug)` (locale хранится для context, но
    1 row per (enrollment, module))
  - status: `not_started | in_progress | done`
- [ ] **26b** — `db/types.ts` ModuleProgressRow + helpers `src/lib/server/student-modules.ts`:
  - `listEnrollmentModules(env, enrollmentId)` — JOIN enrollment_modules + modules + module_progress
  - `getModuleForStudent(env, userId, slug)` — auth check + metadata + progress
  - `markModuleProgress(env, enrollmentId, slug, status)` — UPDATE/INSERT
  - `getCurrentModule(...)` — первый non-done в order
- [ ] **26c** — `/[locale]/dashboard/index.astro` (paid view):
  - Заменить stub.modules на real list
  - "Continue" card → getCurrentModule
  - Stats: progress (done / total) реальные
- [ ] **26d** — `/[locale]/dashboard/modules/[slug].astro`:
  - SSR + requireRole('student')
  - Verify student owns enrollment с этим module
  - Sequential unlock check (если требуется по requires_modules)
  - Fetch metadata из D1 + body из R2
  - Render markdown via marked
  - "Mark complete" кнопка (POST /api/student/modules/[slug]/complete)
- [ ] **26e** — `POST /api/student/modules/[slug]/complete`:
  - Auth: requireRoleApi('student')
  - Verify ownership
  - INSERT/UPDATE module_progress status='done', completed_at=now
- [ ] **26f** — Markdown rendering: `marked` (npm add marked) — мелкая
  библиотека ~30KB, edge-safe. Sanitize не нужен (body controlled
  методистом). Configure: GFM tables, no raw HTML
- [ ] **26g** — Тест end-to-end через Playwright:
  1. Login as paid student → /dashboard
  2. Видит реальные модули (не stub)
  3. Click первый → /dashboard/modules/beg-01-lumiere-frame
  4. Видит rendered markdown
  5. Click "Mark complete" → возврат в /dashboard
  6. Module marked done, next unlocked

## Не входит

- Homework submission UI — Sprint 2
- Live session видео (Vidstack) — Sprint 2
- Instructor 1:1 review thread — Sprint 2
- Module versioning (методист правит body) — Sprint 2
- Comments / discussion per module — Sprint 3
- Notes / bookmarks — Sprint 3

## Critical files

- `migrations/0010_module_progress.sql` (новая)
- `db/types.ts` — + `ModuleProgressRow`, `ModuleStatus` уже есть
- `src/lib/server/student-modules.ts` (новая)
- `src/pages/[locale]/dashboard/index.astro` (rewrite paid view)
- `src/pages/[locale]/dashboard/modules/[slug].astro` (новая)
- `src/pages/api/student/modules/[slug]/complete.ts` (новая)
- `src/components/dashboard/ModuleStudyView.astro` (новая, опц.)
