# Student LK v2 — Stage F: Cron + GDPR + retention

> Spec: `docs/student-lk-v2-spec.md` § 6 + § 4.2 + § Q10.
> Depends on: A, B, C, D.

## Чеклист

- [ ] **F1** — Cron infrastructure:
  - `wrangler.toml` [triggers] crons (4 jobs).
  - Handler entry `src/lib/server/cron/index.ts`.
  - Astro config: scheduled handler exposed через
    `functions/_worker.ts` (or similar adapter).
- [ ] **F2** — `cron/auto-approve.ts` (every 15 min):
  - SELECT pending where uploaded_at < next non-cancelled session.
  - UPDATE status='auto_approved'.
- [ ] **F3** — `cron/retention.ts` (daily 03:00 UTC):
  - SELECT enrollments past grace (completed_at+30 OR cancelled_at+30 OR
    gdpr_delete_requested_at + completed/cancelled).
  - Batch transaction: INSERT enrollment_stats + INSERT curriculum_feedback
    (anonymized) + UPDATE archived_at + DELETE homework_submissions.
  - R2 file delete post-transaction.
- [ ] **F4** — `cron/pre-archive-email.ts` (daily 04:00 UTC):
  - SELECT 23-24 days after completed/cancelled, not yet emailed.
  - Send via Resend + mark pre_archive_email_sent_at.
- [ ] **F5** — `cron/orphan-cleanup.ts` (daily 05:00 UTC):
  - S3 LIST `homework/` prefix.
  - Compare с D1 file_r2_key columns.
  - Delete orphans старше 24h.
- [ ] **F6** — GDPR endpoint `POST /api/account/delete`:
  - Confirmation "DELETE" required.
  - User soft-delete + revoke sessions + cascade.
  - LK_CONFIG.gdpr_delete_mode logic.
- [ ] **F7** — `POST /api/account/notifications-toggle`:
  - UPDATE users.notifications_email.
- [ ] **F8** — `/account` page UI updates:
  - Delete section с ConfirmModal (typing DELETE).
  - Notifications toggle.

## Не входит

- Browser push (Future migrations).
- CF Email Service migration (Future migrations).

## Critical files

- `wrangler.toml` (cron triggers)
- `src/lib/server/cron/index.ts`, `auto-approve.ts`, `retention.ts`,
  `pre-archive-email.ts`, `orphan-cleanup.ts`
- `src/pages/api/account/delete.ts`
- `src/pages/api/account/notifications-toggle.ts`
- `src/pages/[locale]/account.astro` (update)
