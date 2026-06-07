# Student LK v2 — Stage D: Instructor minimal endpoints

> Spec: `docs/student-lk-v2-spec.md` § 8 Stage D + § 4.3.
> Depends on: Stage A, B, C.

## Цель

Закрыть feedback loop — instructor может review submissions + дать
комментарий + опц. annotated copy + override unlock. Минимальный UI
для review page.

## Чеклист

- [ ] **D1** — `src/lib/server/instructor-homework.ts`:
  - `getReviewQueue(env, instructorId, filters?)` — pending submissions
    для lead_instructor.
  - `getReviewMetrics(env, instructorId)` — counters (awaiting, this week).
  - `getSubmissionForReview(env, instructorId, submissionId)` — ACL + detail.
  - `submitReview(env, params)` — UPDATE status + comment + reviewed_*.
  - `createOverride(env, params)` — UPDATE enrollment_modules.unlock_override_*.
  - `removeOverride(env, params)` — UPDATE → NULL.

- [ ] **D2** — API endpoints:
  - `POST /api/instructor/homework/submissions/[id]/review`
  - `POST /api/instructor/homework/submissions/[id]/annotation-upload-url`
  - `POST /api/instructor/homework/submissions/[id]/annotation-finalize`
  - `POST /api/instructor/enrollment-modules/[eid]/[slug]/unlock-override`
  - `DELETE /api/instructor/enrollment-modules/[eid]/[slug]/unlock-override`

- [ ] **D3** — Resend feedback email helper:
  - `src/lib/server/email/feedback.ts` — sendFeedbackEmail(env, submission).
  - Triggered from review endpoint (one-shot, idempotent через
    feedback_email_sent_at).
  - Template inline (HTML + text fallback).

- [ ] **D4** — `/instructor/homework/[id]` review page:
  - SSR + requireRole('instructor').
  - File preview (Vidstack для video, iframe PDF, img для image, download
    для остального).
  - Form: status radio + comment textarea + annotated upload.
  - Submit → POST review → redirect back to queue.

- [ ] **D5** — `/instructor/index.astro` real data:
  - Replace stub.awaitingReview / reviewedThisWeek / oldestDays etc.
  - Real pending queue cards (Stage 21 stub → links to /instructor/homework/[id]).
  - StudentRow.href real → /instructor/students/[id] (minimal page или
    переадресация на queue с фильтром per student).

- [ ] **V** — verify zero typecheck/lint/build errors.

## Не входит

- Cron auto-approve (Stage F).
- Co-instructors per cohort (Future migrations).
- `/instructor/students/[id]` full detail (Sprint 2 — Instructor LK v2
  full delivery).
- LLM pre-check integration (Future).

## Critical files

- `src/lib/server/instructor-homework.ts` (new)
- `src/lib/server/email/feedback.ts` (new)
- `src/pages/api/instructor/homework/submissions/[id]/review.ts` (new)
- `src/pages/api/instructor/homework/submissions/[id]/annotation-upload-url.ts` (new)
- `src/pages/api/instructor/homework/submissions/[id]/annotation-finalize.ts` (new)
- `src/pages/api/instructor/enrollment-modules/[eid]/[slug]/unlock-override.ts` (new)
- `src/pages/[locale]/instructor/homework/[id].astro` (new)
- `src/pages/[locale]/instructor/index.astro` (rewrite)
