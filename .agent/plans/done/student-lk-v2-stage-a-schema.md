# Student LK v2 — Stage A: Schema migrations + backfill

> Spec: `docs/student-lk-v2-spec.md` § 8 Stage A + § 9 Migration plan.
> Это первый stage серии student-lk-v2 (A → B → ... → G).
> После закрытия — `git mv` в `.agent/plans/done/` отдельным коммитом.

## Цель

Привести D1 schema и R2 layout к финальному состоянию, описанному в
spec § 2 Data model. После Stage A — existing stage26 код продолжает
работать (читает workbook_r2_key вместо body_r2_key через backfill),
никаких UI changes.

**Stages B-G не блокируются если Stage A прошёл успешно.**

## Чеклист

### M1 — Sessions table + cohorts.meeting_*

- [ ] **M1a.** Создать `migrations/0011_sessions.sql`:
  - CREATE TABLE sessions (см. spec § 2.1).
  - ALTER cohorts ADD COLUMN meeting_provider / meeting_url /
    meeting_host_url / modules_snapshot_json.
  - CREATE INDEX idx_sessions_cohort_order / scheduled / module.
- [ ] **M1b.** Применить на **local dev D1**:
  `pnpm wrangler d1 migrations apply moirai-db --local`.
- [ ] **M1c.** Проверить sqlite schema: `pnpm wrangler d1 execute
  moirai-db --local --command "PRAGMA table_info(sessions);"`.

### M2 — Modules split prep

- [ ] **M2a.** Создать `migrations/0012_modules_split.sql`:
  - ALTER modules ADD presentation_r2_key / workbook_r2_key (nullable).
- [ ] **M2b.** Применить на local D1.

### M3 — Data migration script (modules R2 keys + homework_md concat)

- [ ] **M3a.** Создать `scripts/migrate-modules-bodies.mjs`:
  - SELECT slug, locale, body_r2_key, homework_md FROM modules.
  - Per row:
    - R2 GET old body_r2_key → text.
    - If homework_md not empty → concat `\n\n## Домашнее задание\n\n${homework_md}\n`
      (RU) или `\n\n## Homework\n\n${homework_md}\n` (EN, locale-aware).
    - R2 PUT `modules/{slug}/workbook.{locale}.md`.
    - UPDATE modules SET workbook_r2_key.
    - UPDATE modules SET presentation_r2_key = `modules/{slug}/presentation.{locale}.md`
      (pointer, content uploads methodist).
- [ ] **M3b.** Использует aws4fetch для R2 S3-compatible API (R2 access
  keys в `.dev.vars` для local).
- [ ] **M3c.** Dry-run mode (`--dry-run`) — печатает что будет сделано,
  не пишет.
- [ ] **M3d.** Запустить на local D1 + local R2 (`wrangler r2 object`).
- [ ] **M3e.** Verify через `pnpm check:r2-d1` — все workbook keys
  имеют D1 row и R2 object.

### M4 — Drop old columns (refactored as script)

**ВАЖНО (2026-06-07 update):** M4 — НЕ миграция. Wrangler `migrations
apply` запускает все pending одной командой, что drop'нет body_r2_key
ДО M3 data migration → data loss. Поэтому M4 = manual script,
запускается ПОСЛЕ verify M3 success.

- [x] **M4a.** ~~Создать `migrations/0013_modules_cleanup.sql`~~ →
      `scripts/apply-modules-cleanup.mjs` (idempotent + pre-checks).
- [ ] **M4b.** Запустить script на local D1 **после** M3 success verify:
  ```bash
  node scripts/apply-modules-cleanup.mjs --local
  ```
  Pre-checks внутри script:
  1. presentation_r2_key + workbook_r2_key columns exist.
  2. workbook_r2_key NOT NULL для всех modules.
  3. Если old columns не существуют — exit 0 (already done).

### M5 — Homework + stats + curriculum_feedback

- [ ] **M5a.** Создать `migrations/0014_homework_submissions.sql`:
  - CREATE TABLE homework_submissions (см. spec § 2.1).
  - CREATE TABLE enrollment_stats.
  - CREATE TABLE curriculum_feedback.
  - CREATE INDEX idx_homework_* + idx_curriculum_*.
- [ ] **M5b.** Применить на local D1.

### M6 — Enrollments + users + enrollment_modules extensions

- [ ] **M6a.** Создать `migrations/0015_enrollments_extensions.sql`:
  - ALTER enrollments ADD cancelled_at / archived_at /
    gdpr_delete_requested_at / pre_archive_email_sent_at /
    homework_last_seen_at.
  - ALTER enrollment_modules ADD unlock_override_at / unlock_override_by /
    unlock_override_reason.
  - ALTER users ADD deleted_at / notifications_email.
- [ ] **M6b.** Применить на local D1.

### M7 — module_progress rename

- [ ] **M7a.** Создать `migrations/0016_module_progress_rename.sql`:
  - ALTER module_progress RENAME COLUMN status TO view_status.
  - UPDATE module_progress SET view_status = 'viewed' WHERE view_status
    IN ('done', 'in_progress').
- [ ] **M7b.** Применить на local D1.

### M8 — Backfill cohorts.modules_snapshot_json

- [ ] **M8a.** Создать `scripts/backfill-cohort-modules-snapshot.mjs`:
  - SELECT id, programme_slug FROM cohorts.
  - Per row: load programme content collection entry → JSON.stringify
    default_modules → UPDATE.
- [ ] **M8b.** Dry-run mode.
- [ ] **M8c.** Запустить на local D1.

### M9 — Backfill sessions для existing active cohorts

- [ ] **M9a.** Создать helper `scripts/lib/compute-session-dates.mjs`:
  - Input: startDate (unix), sessionsCount, days array, timeEt.
  - Output: array of unix UTC timestamps.
  - DST-aware через `date-fns-tz` (npm install в scripts only).
- [ ] **M9b.** Создать `scripts/backfill-sessions.mjs`:
  - JOIN cohorts + cohort_slots WHERE status IN ('open','running').
  - Per cohort: parse modules_snapshot, compute dates, INSERT sessions.
  - Idempotent — `INSERT OR IGNORE` через UNIQUE (cohort_id, module_slug).
- [ ] **M9c.** Dry-run mode.
- [ ] **M9d.** Запустить на local D1.

### Update TypeScript types

- [ ] **T1.** `db/types.ts` обновить:
  - + `SessionRow` (всего полей + status enum).
  - + `HomeworkSubmissionRow` со всеми полями.
  - + `EnrollmentStatsRow`, `CurriculumFeedbackRow`.
  - + новые поля в `EnrollmentRow`, `UserRow`, `EnrollmentModuleRow`,
    `CohortRow`.
  - module_progress.status → view_status.
- [ ] **T2.** `pnpm typecheck` зелёный.

### Production rollout (NOT в этом stage — отдельный commit + explicit "go")

- [ ] **P1.** Pre-deploy:
  - `pnpm wrangler d1 export moirai-db --output=backup-$(date +%F).sql`.
  - Commit backup file (gitignored) или сохранить локально.
- [ ] **P2.** Применить migrations 0011-0016 на production:
  `pnpm wrangler d1 migrations apply moirai-db` (без --local).
- [ ] **P3.** Запустить scripts M3, M8, M9 на production (отдельные
  команды).
- [ ] **P4.** Smoke test student dashboard на production.
- [ ] **P5.** `pnpm check:r2-d1` на production verify.

## Verify steps

После всех migrations + scripts на local D1:

```bash
pnpm typecheck          # zero errors
pnpm check:r2-d1        # zero inconsistencies
pnpm wrangler d1 execute moirai-db --local --command \
  "SELECT COUNT(*) FROM sessions;"           # > 0 для existing active cohorts
pnpm wrangler d1 execute moirai-db --local --command \
  "SELECT COUNT(*) FROM modules WHERE workbook_r2_key IS NOT NULL;"
                                              # = всех existing 24 modules × 2 locales = 48
pnpm wrangler d1 execute moirai-db --local --command \
  "SELECT COUNT(*) FROM cohorts WHERE modules_snapshot_json != '[]';"
                                              # = всех existing cohorts
```

Local dev sanity: `pnpm dev` → /dashboard → modules grid рендерится
(старый код, читает workbook_r2_key вместо body_r2_key — никаких
visible изменений).

## Git workflow

После каждой логической группы (M1-M2 / M3 script / M4 / M5-M7 /
M8-M9 / types update) — отдельный commit. После M9 + T2 verify
успех — финальный commit. Stage A закрыт.

`git mv .agent/plans/active/student-lk-v2-stage-a-schema.md
.agent/plans/done/` — отдельный commit (PLANS LIFECYCLE).

## Не входит

- UI changes (Stage E).
- New API endpoints (Stages C, D).
- Cron jobs (Stage F).
- Production deploy (требует explicit lottoprof "go", отдельный шаг).

## Critical files

- `migrations/0011_sessions.sql` (new)
- `migrations/0012_modules_split.sql` (new)
- `migrations/0013_modules_cleanup.sql` (new)
- `migrations/0014_homework_submissions.sql` (new)
- `migrations/0015_enrollments_extensions.sql` (new)
- `migrations/0016_module_progress_rename.sql` (new)
- `scripts/migrate-modules-bodies.mjs` (new)
- `scripts/backfill-cohort-modules-snapshot.mjs` (new)
- `scripts/backfill-sessions.mjs` (new)
- `scripts/lib/compute-session-dates.mjs` (new)
- `db/types.ts` (updated)
- `wrangler.toml` (no change — миграции автоматом)
