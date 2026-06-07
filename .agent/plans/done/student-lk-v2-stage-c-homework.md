# Student LK v2 — Stage C: Homework submission (student-side)

> Spec: `docs/student-lk-v2-spec.md` § 8 Stage C + § 4.2.
> Depends on: Stage A (schema), Stage B (unlock helpers).

## Цель

Student может upload ДЗ (видео/PDF/image/etc до 100 MB) через pre-signed
URL pattern. Видит свои submissions с status + feedback. Может resubmit.

## Чеклист

### C1 — R2 pre-signed URL helper (aws4fetch)

- [ ] **C1a.** Установить `aws4fetch` (если нет). ✅ DONE.
- [ ] **C1b.** Создать `src/lib/server/r2-signed.ts`:
  - `generateUploadUrl(env, key, contentType, expiresInSec)` →
    pre-signed PUT URL через aws4fetch + S3-compatible R2 endpoint.
  - `generateGetUrl(env, key, expiresInSec)` → pre-signed GET URL.
- [ ] **C1c.** Wrangler bindings: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
  R2_ACCOUNT_ID — env vars (через `.dev.vars` локально, wrangler secrets
  в проде).

### C2 — Homework helpers

- [ ] **C2a.** Создать `src/lib/server/homework.ts`:
  - `listSubmissionsForStudent(env, userId, opts?)` — список с фильтрами.
  - `getSubmissionForStudent(env, userId, submissionId)` — ownership check.
  - `listSubmissionsForModule(env, enrollmentId, moduleSlug)` — для inline.
  - `createSubmission(env, params)` — finalize endpoint logic
    (compute is_late + priority + INSERT).
  - `updateHomeworkLastSeen(env, userId)` — для in-app badge.
  - `countUnreadFeedback(env, userId)` — для navbar badge.

### C3 — API endpoints

- [ ] **C3a.** `POST /api/student/homework/upload-url`:
  - Auth: requireRoleApi('student').
  - Validate: contentType whitelist (Q2a), sizeBytes ≤ 100 MB,
    module unlocked.
  - Return `{ submissionId, uploadUrl, expiresAt }`.
- [ ] **C3b.** `POST /api/student/homework/submissions` (finalize):
  - Auth + ownership + idempotency check.
  - HEAD R2 object verify exists + size matches.
  - INSERT row через createSubmission.
- [ ] **C3c.** `GET /api/student/homework/submissions/[id]/file-url`:
  - ACL: own submission OR (lead_instructor for that enrollment OR admin).
  - Return signed GET URL.
- [ ] **C3d.** `GET /api/student/homework/submissions/[id]/annotation-url`:
  - Same ACL. Возвращает signed URL для instructor_annotation_r2_key.
- [ ] **C3e.** `POST /api/student/homework/last-seen`:
  - Updates enrollments.homework_last_seen_at.

### C4 — UI компоненты

- [ ] **C4a.** Создать `src/components/dashboard/SubmissionCard.astro`:
  - Display: filename, size, дата, status badge, student_comment,
    instructor_comment (markdown rendered), annotated copy link, late label.
  - Status badges: pending/needs_revision/approved/auto_approved.
  - Кнопка "Download" + (если video) inline player (Vidstack или
    fallback `<video>`).
- [ ] **C4b.** Создать `src/components/dashboard/SubmissionUploader.astro`:
  - Form с file input + опц. comment textarea.
  - Inline `<script>` для pre-signed URL flow:
    1. POST /api/student/homework/upload-url → get signed URL.
    2. PUT R2 (with progress via XHR or fetch).
    3. POST finalize endpoint.
    4. Reload или toast success.
  - Memo: idempotency_key (UUID generated client-side).

### C5 — Inline homework section на module page

- [ ] **C5a.** В `dashboard/modules/[slug].astro`:
  - Если `module_.has_homework`, добавить секцию "Homework" внизу
    (после body).
  - Загрузить submissions для этого (enrollment, module) через
    `listSubmissionsForModule`.
  - Render: SubmissionUploader (если ничего нет) + SubmissionCards.
  - Stage E refactor в Homework tab.

### C6 — Aggregate /dashboard/homework page

- [ ] **C6a.** Создать `src/pages/[locale]/dashboard/homework/index.astro`:
  - Auth: requireRole('student').
  - Listing всех submissions across modules.
  - Фильтры (query params): status (pending/needs_revision/approved),
    is_late, module_slug.
  - Update homework_last_seen_at при load.
- [ ] **C6b.** Update DashboardNav: "Homework" link → `/dashboard/homework`
  (был на /dashboard).
- [ ] **C6c.** Badge counter на nav-item "Homework" (через
  countUnreadFeedback). Stage E добавит SVG icon.

### Verify

- [ ] **V1.** `pnpm typecheck` zero errors.
- [ ] **V2.** `pnpm lint` zero errors.
- [ ] **V3.** `pnpm build` зелёный.
- [ ] **V4.** Local dev: dashboard auth-guard работает, module page
  рендерит inline homework section.

## Не входит

- Annotated copy upload **от instructor side** (Stage D).
- Resend email notifications (Stage F).
- Drawer/tabs/presentation mode (Stage E).
- Phosphor icons (Stage E).
- Cron auto-approve (Stage F).

## Git workflow

Каждая логическая группа (C1, C2, C3, C4, C5, C6) — отдельный commit.

## Critical files

- `src/lib/server/r2-signed.ts` (new)
- `src/lib/server/homework.ts` (new)
- `src/pages/api/student/homework/upload-url.ts` (new)
- `src/pages/api/student/homework/submissions.ts` (new)
- `src/pages/api/student/homework/submissions/[id]/file-url.ts` (new)
- `src/pages/api/student/homework/submissions/[id]/annotation-url.ts` (new)
- `src/pages/api/student/homework/last-seen.ts` (new)
- `src/components/dashboard/SubmissionCard.astro` (new)
- `src/components/dashboard/SubmissionUploader.astro` (new)
- `src/pages/[locale]/dashboard/modules/[slug].astro` (update — homework section)
- `src/pages/[locale]/dashboard/homework/index.astro` (new)
- `src/components/dashboard/DashboardNav.astro` (update — Homework link)
- `wrangler.toml` (add R2 access env hints — secrets через wrangler secret put)
