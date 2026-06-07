# Student ЛК v2 — Specification

> Source of truth для имплементации. Архитектурные решения и обоснования —
> в `.agent/plans/active/student-lk-v2-discovery.md` (рабочая площадка
> с альтернативами). Этот документ — финальная спека, по которой пишется
> код. При расхождении spec ↔ discovery — побеждает spec.
>
> Параллельный: `instructor-lk-v2-discovery.md` (не имплементируется
> в этом раунде, но schema учитывает instructor-side flow — см. §10).

---

## 0. Status

| Поле | Значение |
|---|---|
| Version | 1.0 |
| Date | 2026-06-07 |
| Author | lottoprof + Claude |
| Implementation owner | TBD |
| Depends on | stage14 (apply flow), stage21 (instructor scaffold), stage22 (R2 module bodies), stage26 (existing student LK) |
| Replaces | stage26 sequential unlock, stage26 Mark complete CTA |

---

## 1. Goals + non-goals

### Goals

1. **Schedule-based unlock** модулей на основе sessions cohort'ы
   (вместо completion-based sequential unlock).
2. **Полный homework submission flow**: upload → preпод review →
   approved / needs_revision / auto_approved + comment + опц.
   annotated copy + resubmit история.
3. **Workbook + Presentation** как отдельные artifacts модуля
   (вместо одного body markdown).
4. **Drawer navigation** для модулей программы + tabs на module page +
   presentation mode для Zoom share-screen.
5. **Sessions table** + расписание в ЛК (next session widget, list,
   inline на module page).
6. **Retention pipeline** — 30 дней grace после `completed_at`,
   aggregate stats + анонимный curriculum corpus.
7. **GDPR delete flow** (`on_completion` default, configurable).
8. **YT lite-load embeds** в markdown body модулей.
9. **Phosphor Thin icons** вместо Unicode emoji.

### Non-goals (vne scope MVP)

- Cloudflare Stream для video transcoding (Resend → CF Email migration
  тоже).
- Live session recordings.
- Browser push notifications.
- Vimeo embed + кастомный markdown синтаксис.
- Slide-by-slide presentation mode.
- Timestamp markers для homework review (Frame.io-style).
- Multi-file submissions.
- Read-position scroll tracking.
- Co-instructors per cohort.
- Hard backups / undo на retention hard delete.
- Instructor LK full overhaul (только minimal endpoints для homework
  review + override unlock).

---

## 2. Data model

### 2.1 Новые таблицы

#### `sessions`

Расписание live-sessions per cohort. 1:1 mapping `module_slug`.

```sql
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,             -- UUID
  cohort_id           TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  module_slug         TEXT NOT NULL,
  order_idx           INTEGER NOT NULL,             -- порядок внутри cohort
  scheduled_at        INTEGER NOT NULL,             -- UTC unix
  meeting_url         TEXT,                         -- override join URL; NULL → cohort.meeting_url
  meeting_host_url    TEXT,                         -- override host URL; NULL → cohort.meeting_host_url
  status              TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK(status IN ('scheduled','passed','cancelled','rescheduled')),
  notes               TEXT,                         -- admin/instructor internal
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX idx_sessions_cohort_order ON sessions(cohort_id, order_idx);
CREATE INDEX idx_sessions_scheduled    ON sessions(scheduled_at);
CREATE INDEX idx_sessions_module       ON sessions(cohort_id, module_slug);
```

**Meeting provider** определяется в `cohorts.meeting_provider`
(`zoom | teams | gmeet | other`) — диктует label кнопки ("Join Zoom" /
"Join Teams" / "Join Google Meet") + icon. URL формат / валидация —
не enforce'им в schema, кладём как opaque строку.

**Host URL** (`meeting_host_url`) — для instructor (Zoom host link
требует Zoom account login; Teams / Meet тоже разделяют). Студент
видит только `meeting_url` (join). Если `meeting_host_url` NULL —
instructor использует тот же `meeting_url` (Zoom recognise host по login).

#### `homework_submissions`

Студенческие сдачи ДЗ + instructor review.

```sql
CREATE TABLE homework_submissions (
  id                                TEXT PRIMARY KEY,           -- UUID, used in R2 path
  enrollment_id                     TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  module_slug                       TEXT NOT NULL,
  idempotency_key                   TEXT NOT NULL,              -- client-generated UUID для retry
  -- file
  file_r2_key                       TEXT NOT NULL,              -- 'homework/{enrollment_id}/{id}.<ext>'
  content_type                      TEXT NOT NULL,              -- mime
  size_bytes                        INTEGER NOT NULL,
  uploaded_at                       INTEGER NOT NULL,
  is_late                           INTEGER NOT NULL DEFAULT 0, -- computed at upload
  -- student
  student_comment                   TEXT,                       -- markdown, ≤ 2000 chars
  -- status
  status                            TEXT NOT NULL DEFAULT 'pending'
                                    CHECK(status IN ('pending','needs_revision','approved','auto_approved')),
  priority                          TEXT NOT NULL DEFAULT 'normal'
                                    CHECK(priority IN ('normal','low')),
  -- LLM pre-check (future, columns reserved)
  llm_draft_status                  TEXT
                                    CHECK(llm_draft_status IS NULL OR llm_draft_status IN ('approved','needs_revision')),
  llm_draft_comment                 TEXT,
  llm_checked_at                    INTEGER,
  -- instructor
  reviewed_by                       TEXT REFERENCES users(id),
  reviewed_at                       INTEGER,
  instructor_comment                TEXT,                       -- markdown, ≤ 10000 chars
  instructor_annotation_r2_key      TEXT,                       -- nullable
  instructor_annotation_uploaded_at INTEGER,
  -- notification state
  feedback_email_sent_at            INTEGER,                    -- idempotency
  created_at                        INTEGER NOT NULL,
  updated_at                        INTEGER NOT NULL,
  UNIQUE (enrollment_id, idempotency_key)
);

CREATE INDEX idx_homework_enrollment_module ON homework_submissions(enrollment_id, module_slug);
CREATE INDEX idx_homework_status            ON homework_submissions(status);
CREATE INDEX idx_homework_pending_priority  ON homework_submissions(status, priority, uploaded_at)
  WHERE status = 'pending';
CREATE INDEX idx_homework_reviewed_by_week  ON homework_submissions(reviewed_by, reviewed_at)
  WHERE reviewed_at IS NOT NULL;
```

#### `enrollment_stats`

Aggregate counters сохраняются при retention archival (после delete
homework_submissions rows). Без PII.

```sql
CREATE TABLE enrollment_stats (
  enrollment_id          TEXT PRIMARY KEY,
  cohort_id              TEXT NOT NULL,
  programme_slug         TEXT NOT NULL,
  total_submissions      INTEGER NOT NULL,
  approved_count         INTEGER NOT NULL,
  needs_revision_count   INTEGER NOT NULL,
  auto_approved_count    INTEGER NOT NULL,
  late_count             INTEGER NOT NULL,
  completed_at           INTEGER NOT NULL,
  archived_at            INTEGER NOT NULL
);

CREATE INDEX idx_enrollment_stats_cohort ON enrollment_stats(cohort_id);
```

#### `curriculum_feedback`

Анонимные instructor comments — сохраняются для curriculum analysis
после retention. Без user_id / enrollment_id / submission_id.

```sql
CREATE TABLE curriculum_feedback (
  id                TEXT PRIMARY KEY,
  cohort_id         TEXT NOT NULL,                  -- сохраняется (per lottoprof)
  module_slug       TEXT NOT NULL,
  instructor_id     TEXT REFERENCES users(id),      -- staff, не PII студента
  homework_status   TEXT NOT NULL
                    CHECK(homework_status IN ('approved','needs_revision','auto_approved')),
  comment_text      TEXT NOT NULL,
  original_at       INTEGER NOT NULL                -- когда коммент был оставлен
);

CREATE INDEX idx_curriculum_feedback_module ON curriculum_feedback(module_slug);
CREATE INDEX idx_curriculum_feedback_cohort ON curriculum_feedback(cohort_id);
```

### 2.2 Изменения существующих таблиц

#### `modules` (миграция полей)

```sql
-- Add: presentation as new artifact, workbook = renamed body
ALTER TABLE modules ADD COLUMN presentation_r2_key TEXT;
ALTER TABLE modules ADD COLUMN workbook_r2_key     TEXT;

-- Data migration:
UPDATE modules SET workbook_r2_key = body_r2_key;
-- homework_md → concat в конец workbook'a через скрипт миграции
-- (см. §8 Migration plan, шаг M3).

-- After data migration в новых colonках:
-- (нельзя DROP COLUMN в SQLite старее 3.35 без recreate table; D1 — 3.45+,
-- DROP COLUMN поддерживается)
ALTER TABLE modules DROP COLUMN body_r2_key;
ALTER TABLE modules DROP COLUMN homework_md;
-- objectives_json, concepts_json — остаются (используются на module page).
```

Final state:
- `presentation_r2_key` NOT NULL после миграции (placeholder для existing
  если methodist не подготовил — заглушка `"presentation will be available
  before the live session"`).
- `workbook_r2_key` NOT NULL после миграции (existing body становится
  workbook).
- `homework_md` УДАЛЕНО — описание ДЗ в workbook как секция
  `## Домашнее задание`.

#### `cohorts`

```sql
ALTER TABLE cohorts ADD COLUMN meeting_provider       TEXT NOT NULL DEFAULT 'zoom'
                                                     CHECK(meeting_provider IN ('zoom','teams','gmeet','other'));
ALTER TABLE cohorts ADD COLUMN meeting_url            TEXT;       -- join link (видят все)
ALTER TABLE cohorts ADD COLUMN meeting_host_url       TEXT;       -- host link (только instructor)
ALTER TABLE cohorts ADD COLUMN modules_snapshot_json  TEXT NOT NULL DEFAULT '[]';
-- modules_snapshot_json заполняется при cohort creation из
-- programme.default_modules. Existing cohorts при миграции —
-- populated через скрипт.
```

#### `enrollments`

```sql
ALTER TABLE enrollments ADD COLUMN cancelled_at              INTEGER;
ALTER TABLE enrollments ADD COLUMN archived_at               INTEGER;
ALTER TABLE enrollments ADD COLUMN gdpr_delete_requested_at  INTEGER;
ALTER TABLE enrollments ADD COLUMN pre_archive_email_sent_at INTEGER;
ALTER TABLE enrollments ADD COLUMN homework_last_seen_at     INTEGER;
```

#### `enrollment_modules`

```sql
ALTER TABLE enrollment_modules ADD COLUMN unlock_override_at      INTEGER;
ALTER TABLE enrollment_modules ADD COLUMN unlock_override_by      TEXT REFERENCES users(id);
ALTER TABLE enrollment_modules ADD COLUMN unlock_override_reason  TEXT;
```

#### `users`

```sql
ALTER TABLE users ADD COLUMN deleted_at           INTEGER;
ALTER TABLE users ADD COLUMN notifications_email  INTEGER NOT NULL DEFAULT 1;
```

#### `module_progress` (упрощение)

Stage 26 ввёл status `not_started | in_progress | done`. После Q1
v2 — `done` определяется через homework_submissions (для практических)
или через session.scheduled_at + 1h (для теоретических). Sequential
unlock убирается.

```sql
-- module_progress остаётся как audit (когда первый раз открыл),
-- но больше не источник истины для completion / unlock.
-- Колонка status переименовывается чтобы не путать:
ALTER TABLE module_progress RENAME COLUMN status TO view_status;
-- view_status: 'not_started' | 'viewed' (не 'done', не 'in_progress')
-- viewed = студент открыл хотя бы раз.
```

Helper `markModuleOpened` остаётся, ставит `view_status='viewed'`.

### 2.3 Migrations order

| # | File | Что |
|---|---|---|
| M1 | `0011_sessions.sql` | CREATE sessions + cohorts.zoom_url + cohorts.modules_snapshot_json |
| M2 | `0012_modules_split.sql` | ADD modules.presentation_r2_key + workbook_r2_key |
| M3 | (script) `scripts/migrate-modules-bodies.mjs` | UPDATE workbook_r2_key = body_r2_key; concat homework_md в workbook R2 files |
| M4 | `0013_modules_cleanup.sql` | DROP modules.body_r2_key + modules.homework_md (после M3 verify) |
| M5 | `0014_homework_submissions.sql` | CREATE homework_submissions + enrollment_stats + curriculum_feedback |
| M6 | `0015_enrollments_extensions.sql` | ALTER enrollments + users + enrollment_modules |
| M7 | `0016_module_progress_rename.sql` | RENAME module_progress.status → view_status |
| M8 | (script) `scripts/backfill-cohort-modules-snapshot.mjs` | Заполнить cohorts.modules_snapshot_json для existing cohorts из programmes |
| M9 | (script) `scripts/backfill-sessions.mjs` | Auto-generate sessions для existing active cohorts |

Detail каждой миграции — см. отдельный раздел §8 при необходимости.

---

## 3. ACL matrix

### 3.1 User states

Все ACL checks выполняются server-side в Astro page guards / API
endpoint handlers. Client-side hints (button visibility) дублируют
проверки, но не заменяют.

| State | Условие |
|---|---|
| `anon` | Нет refresh session |
| `authed_no_enrollment` | Login есть, `enrollments.user_id = ?` пуст |
| `awaiting_payment` | `enrollment.status = 'awaiting_payment'` |
| `active` | `enrollment.status = 'active' AND archived_at IS NULL` |
| `completed` | `enrollment.status = 'completed' AND archived_at IS NULL` |
| `archived` | `enrollment.archived_at IS NOT NULL` (после retention) |
| `cancelled` | `enrollment.status = 'cancelled'` (admin refund + grace) |
| `deleted` | `users.deleted_at IS NOT NULL` (GDPR) — fully blocked |
| `instructor` | `users.roles ⊇ {instructor}` (independent of enrollment) |
| `instructor_lead_for(cohort)` | `cohort.lead_instructor_id = user.id` |
| `admin` | `users.roles ⊇ {admin}` |

`deleted` state — все login attempts отвергаются, session-cookie
revoked. User row остаётся для FK references but PII очищена (§ Q10.C).

### 3.2 Access matrix — student-facing resources

| Resource | anon | awaiting_payment | active | completed | archived | cancelled |
|---|---|---|---|---|---|---|
| `/[locale]/dashboard` | redirect login | pre-payment view | full | full | redirect "/" | "/" + notice |
| `/dashboard/modules/[slug]` | 404 | 404 | если unlocked | если unlocked | 404 | 404 |
| `/dashboard/modules/[slug]/present` | 404 | 404 | если unlocked | если unlocked | 404 | 404 |
| `/dashboard/homework` | redirect login | 404 | full | full (read-only) | 404 | 404 |
| `/dashboard/sessions` | redirect login | preview | full | full | 404 | 404 |
| `/account` | redirect login | full | full | full | full (GDPR delete only) | full |
| Submission upload (`POST /api/student/homework/...`) | 401 | 403 | OK | OK | 403 | 403 |
| Module presentation/workbook fetch (R2 via signed URL) | 401 | 403 (locked) | OK if unlocked | OK if unlocked | 403 | 403 |
| Submission file GET (own) | 401 | — | OK | OK | 403 (deleted) | 403 |

**Unlock условие модуля для `active`/`completed`:**
```
unlocked =
  enrollment_modules.unlock_override_at IS NOT NULL
  OR now >= session.scheduled_at − LK_CONFIG.unlock_lead_hours
```

### 3.3 Access matrix — instructor-facing resources

| Resource | non-instructor | instructor (any) | instructor_lead_for(cohort) | admin |
|---|---|---|---|---|
| `/[locale]/instructor` | 403 | full | full | full |
| `/instructor/homework/[id]` | 403 | 403 unless lead | OK | OK (any cohort) |
| Submission file GET (instructor view) | 403 | 403 | OK | OK |
| `POST /api/instructor/homework/submissions/[id]/review` | 403 | 403 | OK | OK |
| `POST /api/instructor/enrollment-modules/.../unlock-override` | 403 | 403 | OK | OK |
| `POST /api/admin/*` | 403 | 403 | 403 | OK |

Co-instructors per cohort — vne scope MVP (см. §10).

### 3.4 Cross-cutting rules

- **Все API endpoints** проверяют CSRF / origin для не-GET methods.
- **Refresh session revoked** (deleted user, sign-out, GDPR delete)
  → middleware блокирует все subsequent requests.
- **Rate limits**:
  - upload-url generation: 30/час per user.
  - homework finalize: 30/час per user.
  - account delete: 1/день per user.
- **Idempotency** на mutate endpoints — через `Idempotency-Key` header
  (UUID, client-generated) + UNIQUE constraint в D1.

---

## 4. Routes

### 4.1 Student pages

Все под `/[locale]/dashboard/**` + `/[locale]/account`. SSR через
`@astrojs/cloudflare` adapter. Используют `DashboardLayout`.

| Route | View | Guard | Comments |
|---|---|---|---|
| `/[locale]/dashboard` | Overview | `requireRole('student')` | View states: `pre_payment` / `paid` (cohort schedule + drawer + stats) / `no_application` |
| `/[locale]/dashboard/modules/[slug]` | Module page (tabs) | `requireRole('student')` + ownership + unlock check | Default `?tab=workbook`. Tabs: Presentation / Workbook / Homework |
| `/[locale]/dashboard/modules/[slug]/present` | Presentation mode | `requireRole('student')` + same checks | Минимальный layout, no nav/drawer/tabs. Title sticky-translate-out. ESC + confirm exit. |
| `/[locale]/dashboard/homework` | Aggregate submissions | `requireRole('student')` | Filters: status, late. Cross-modules. |
| `/[locale]/dashboard/sessions` | Cohort schedule | `requireRole('student')` | Past + upcoming sessions с meeting URLs |
| `/[locale]/account` | Auth methods + delete | `requireAuth({allowDeactivated:true})` | GDPR delete button section |

### 4.2 Student API endpoints

Все под `/api/student/**`. Auth: `requireRoleApi('student')`.

#### Homework submission flow

**`POST /api/student/homework/upload-url`**
- Body: `{ moduleSlug, contentType, sizeBytes, idempotencyKey }`
- Validate: contentType в whitelist (Q2a), sizeBytes ≤ 100 MB,
  enrollment active + module unlocked.
- Response: `{ submissionId, uploadUrl, expiresAt }`
- Side: pre-generated submission row не создаётся (только signed URL).
  Row создаётся при finalize.
- Errors: 401, 403 (not enrolled / locked), 400 (invalid input),
  413 (too large), 415 (unsupported type), 429 (rate limit).

**`POST /api/student/homework/submissions`** (finalize)
- Body: `{ submissionId, moduleSlug, fileR2Key, contentType, sizeBytes,
  studentComment, idempotencyKey }`
- Validate: ownership idempotency_key, R2 object exists (HEAD check),
  size matches.
- Compute: `is_late = uploaded_at > next_session.scheduled_at`,
  `priority = 'low' if module already done else 'normal'`.
- Insert row `status='pending'`.
- Errors: 401, 403, 404 (R2 object missing), 409 (idempotency hit —
  return existing row id, no error to client).

**`GET /api/student/homework/submissions/[id]/file-url`**
- ACL: own submission OR (lead_instructor_for_enrollment OR admin).
- Response: `{ url, expiresAt }` — signed R2 GET URL, TTL
  `LK_CONFIG.signed_get_url_ttl_seconds`.
- Errors: 401, 403, 404.

**`GET /api/student/homework/submissions/[id]/annotation-url`**
- Same as above, для `instructor_annotation_r2_key`.

**`POST /api/student/homework/last-seen`**
- Body: `{}` (no params, marks "user viewed /dashboard/homework").
- Side: `UPDATE enrollments SET homework_last_seen_at = now WHERE user_id = ?`
- Used by badge computation (Q2f).

#### Account

**`POST /api/account/delete`**
- Body: `{ confirmation: "DELETE" }` (exact match required).
- Side: GDPR delete flow (§ Q10.C):
  - `users.deleted_at = now`, email/password → NULL.
  - DELETE user_auth_methods.
  - Revoke all auth_sessions.
  - If `LK_CONFIG.gdpr_delete_mode === 'on_completion'` →
    `enrollments.gdpr_delete_requested_at = now`.
  - If `'immediate'` → cascading archive + delete R2 immediately.
- Response: `{ ok: true }` + Set-Cookie clear → client redirect "/".

**`POST /api/account/notifications-toggle`**
- Body: `{ enabled: boolean }`
- Side: `UPDATE users SET notifications_email = ?`.

### 4.3 Instructor minimal endpoints (для closing loop)

Существующая `/instructor` overview обновляется (real data, не stub).
Новые routes:

| Route | Method | ACL |
|---|---|---|
| `/[locale]/instructor/homework/[id]` | GET | `requireRole('instructor')` + lead check |
| `/api/instructor/homework/submissions/[id]/review` | POST | same |
| `/api/instructor/homework/submissions/[id]/annotation-upload-url` | POST | same |
| `/api/instructor/enrollment-modules/[enrollmentId]/[moduleSlug]/unlock-override` | POST | same |
| `/api/instructor/enrollment-modules/[enrollmentId]/[moduleSlug]/unlock-override` | DELETE | same (undo) |

**`POST /api/instructor/homework/submissions/[id]/review`**
- Body: `{ status: 'approved'|'needs_revision', comment?: string }`
- Validate: comment required if `needs_revision`, comment ≤ 10000.
- Side:
  - `UPDATE homework_submissions SET status, instructor_comment,
    reviewed_by, reviewed_at`.
  - Trigger feedback email через Resend (one-shot, idempotency through
    `feedback_email_sent_at`).
- Errors: 401, 403, 404, 400, 409 (already reviewed — return current state).

**`POST /api/instructor/homework/submissions/[id]/annotation-upload-url`**
- Same as student upload-url, для annotated copy.
- Response: `{ uploadUrl, expiresAt }`.
- После client PUT R2 — отдельный endpoint finalize:

**`POST /api/instructor/homework/submissions/[id]/annotation-finalize`**
- Body: `{ fileR2Key, contentType, sizeBytes }`.
- Side: `UPDATE homework_submissions SET instructor_annotation_r2_key,
  instructor_annotation_uploaded_at`.

**`POST /api/instructor/enrollment-modules/.../unlock-override`**
- Body: `{ reason?: string }`.
- Side: `UPDATE enrollment_modules SET unlock_override_at, unlock_override_by,
  unlock_override_reason`.
- Audit log entry `kind='module_unlock_override'`.

**`DELETE /api/instructor/enrollment-modules/.../unlock-override`** (undo)
- Side: `UPDATE enrollment_modules SET unlock_override_at = NULL,
  unlock_override_by = NULL, unlock_override_reason = NULL`.
- Audit log entry `kind='module_unlock_override_undo'`.

### 4.4 Удаляем (stage26 leftovers)

| Route | Причина |
|---|---|
| `POST /api/student/modules/[slug]/complete` | Mark complete убран (Q1) |
| `markModuleComplete` helper в `student-modules.ts` | Same |
| Кнопка `mark-complete-btn` script в `[slug].astro` | Same |

### 4.5 Существующие endpoints (без изменений, для контекста)

- `/api/auth/*` (login / logout / verify / etc.) — stage19.
- `/api/admin/applications/*` — stage14.
- `/api/admin/cohorts/*` — stage14.
- `/api/admin/users/*` — stage21.

При implementation Stage F (см. §8) — добавим admin endpoints для cohort
operations (CRUD sessions, edit meeting_url, etc.).

---


## 5. UI components

### 5.1 Layouts

**`src/layouts/dashboard/Layout.astro`** — модифицируется:
- Добавляется `<ModulesDrawer>` slot (left side).
- Permanent sidebar на desktop ≥1024, overlay на mobile/tablet.
- Top nav `<DashboardNav>` обновляется (см. ниже).

**`src/layouts/dashboard/PresentationLayout.astro`** — новый:
- Минимальный chrome: только sticky exit button + title.
- Title sticky-translate-out при scroll-down.
- Без drawer / tabs / dashboard nav.
- Background `var(--ink)` (dark).
- Typography overrides (большие H1/H2/H3, body 22-24px).
- Width container 1200px, padding 64px.
- Используется для `/dashboard/modules/[slug]/present`.

### 5.2 Components catalog

| File | Назначение | Используется в |
|---|---|---|
| `src/components/dashboard/ModulesDrawer.astro` | Side panel с list модулей программы | DashboardLayout slot |
| `src/components/dashboard/ModuleTabs.astro` | Tabs Presentation / Workbook / Homework | `modules/[slug].astro` |
| `src/components/dashboard/SubmissionCard.astro` | One submission row (status, comment, files) | Homework tab + `/dashboard/homework` |
| `src/components/dashboard/SubmissionUploader.astro` | Pre-signed URL flow + progress | Homework tab |
| `src/components/dashboard/NextSessionWidget.astro` | "Next session" card на overview | `dashboard/index.astro` |
| `src/components/dashboard/SessionRow.astro` | Row в `/dashboard/sessions` list | `dashboard/sessions/index.astro` |
| `src/components/shared/MarkdownContent.astro` | Server-side `marked` rendering + YT extension | Module tabs, presentation mode |
| `src/components/shared/ConfirmModal.astro` | Generic confirm modal (typing-required for delete) | Presentation exit, GDPR delete, instructor override |
| `src/components/dashboard/DashboardNav.astro` | Обновляется: убираем "Modules" link, добавляем hamburger trigger | layout |
| `src/components/dashboard/HomeworkCard.astro` | Существующий, остаётся | overview |

Обновление существующих:
- `ModuleCard.astro` → SVG icons (Lock, Check) вместо Unicode.
- `dashboard/index.astro` → убираем "Mark complete" CTA, статусы через
  template-conditional с SVG icons.
- `dashboard/modules/[slug].astro` → разворачиваем в tabs view.

### 5.3 Drawer (`ModulesDrawer.astro`)

**Props:**
```ts
interface Props {
  locale: 'en' | 'ru';
  programmeTitle: string;
  modules: Array<{
    slug: string;
    title: string;
    orderIdx: number;
    status: 'done' | 'current' | 'locked';
    unlockDate?: number;  // unix, для locked
  }>;
  doneCount: number;
  totalCount: number;
}
```

**Layout:**
- Width: `LK_CONFIG.drawer_width_px` (320).
- Header: programme title + progress "3 / 12 done".
- Body: scrollable list of `ModuleCard`-like rows (compact).
- Footer: link "Back to overview" (`/dashboard`).

**Behaviour:**
- Desktop ≥1024: permanent sidebar, `transform: translateX(0)` open.
  Toggle button collapses (`localStorage` persistence).
- Tablet 768-1023: overlay через hamburger, tap-outside close, body
  scroll lock.
- Mobile <768: overlay + edge swipe (zone `LK_CONFIG.drawer_edge_swipe_zone_px = 20`).

### 5.4 Tabs (`ModuleTabs.astro`)

**Props:**
```ts
interface Props {
  locale: 'en' | 'ru';
  moduleSlug: string;
  activeTab: 'presentation' | 'workbook' | 'homework';
  hasNewFeedback?: boolean;  // бейдж на Homework tab
}
```

**ARIA pattern:** `role="tablist"` + `role="tab"` + `aria-selected` +
keyboard left/right navigation.

**URL state:** `history.replaceState({}, '', '?tab=<new>')` при switch.
Не pushState (см. § Q2b review).

**Sticky:**
- Desktop: `position: sticky; top: 0` на content area.
- Mobile/tablet: не sticky.

**Mobile swipe:** horizontal swipe в content area переключает tab
(не в left 20px edge zone).

**Default tab при mount:**
- Если есть submission с `needs_revision` для этого module → `homework`
  (с бейджем).
- Иначе → `workbook`.

### 5.5 Presentation mode (`PresentationLayout.astro` + page)

**Page:** `/dashboard/modules/[slug]/present`.

**Trigger:** кнопка "Open in presentation mode" в Presentation tab
(target="_blank").

**Keyboard:**
- `←` / `→` — prev/next module (среди unlocked).
- `Esc` — open ConfirmModal "Exit presentation mode?". Confirm → back
  to `/dashboard/modules/[slug]?tab=presentation`.
- `F` — fullscreen toggle (`document.documentElement.requestFullscreen()`).

**Title behaviour:** на scroll-down translateY(-100%) с transition.
На scroll-up — возвращается.

**Empty content (пустой `presentation_r2_key`):** large placeholder
"Materials will be available before the live session" + дата.

### 5.6 Icons (`src/components/icons/`)

Phosphor Thin, stroke 8, viewBox 256×256, `currentColor`.

Per-icon Astro components:
```
src/components/icons/
  Lock.astro        — locked модули
  Check.astro       — done статусы
  CheckCircle.astro — drawer done items
  ArrowLeft.astro   — prev module
  ArrowRight.astro  — next module
  CaretLeft.astro   — inline chevron
  CaretRight.astro  — inline chevron
  List.astro        — drawer hamburger
  X.astro           — exit / close
  Play.astro        — YT play button
```

Default size: 20px. Sizes по контексту:
- 14px — inline body text, status badges, card statuses
- 20px — buttons, action triggers
- 24px — nav items, drawer trigger, footer nav

**Иконки берутся** из `@phosphor-icons/core` GitHub repo (MIT) —
копируем SVG path в `.astro` файлы (без npm-deps).

### 5.7 Markdown rendering (`MarkdownContent.astro`)

```astro
---
import { marked } from 'marked';
import { youtubeExtension } from '../../lib/markdown/extensions/youtube';

interface Props { md: string; }
const { md } = Astro.props;

marked.setOptions({ gfm: true, breaks: false });
marked.use(youtubeExtension);

const fmStripped = md.replace(/^---\n[\s\S]*?\n---\n/, '');
const html = await marked.parse(fmStripped);
---
<div class="prose" set:html={html} />
```

**YouTube extension** (`src/lib/markdown/extensions/youtube.ts`):
- Paragraph-level token: if children = single text with URL matching
  YT regex → replace with embed HTML.
- URL forms: `youtube.com/watch?v=ID`, `youtu.be/ID`,
  `youtube.com/embed/ID`.
- `?t=<sec>` → `?start=<sec>` в iframe src.
- Output HTML: `<div class="yt-embed" data-video-id="..."
  data-start="..."><img src="img.youtube.com/vi/<id>/maxresdefault.jpg"
  loading="lazy"><button class="yt-embed__play">[icon]</button></div>`.

**Vanilla JS** в page (`MarkdownContent.astro` включает inline `<script>`):
- `querySelectorAll('.yt-embed')` → click handler swap на `<iframe>`.

**CSS (`.prose`)** — обновляется в `src/styles/`:
- h2/h3/p/ul/ol/blockquote/code/table стандарт.
- Tables: wrapper `overflow-x: auto`.
- Images: `max-width: 100%; height: auto`.
- `.yt-embed`: `aspect-ratio: 16/9; max-width: 100%`.
- Code blocks: `overflow-x: auto`.

### 5.8 i18n keys

Все strings — в page files inline (current pattern) либо вынесены
в `src/lib/i18n/student-lk.ts` (для shared между several pages).

**Новые ключи (RU / EN):**

| Key | RU | EN |
|---|---|---|
| `tabs.presentation` | "Презентация" | "Presentation" |
| `tabs.workbook` | "Опорный материал" | "Workbook" |
| `tabs.homework` | "Домашнее задание" | "Homework" |
| `drawer.title` | "Модули программы" | "Programme modules" |
| `drawer.progress` | "{done} из {total} пройдено" | "{done} of {total} done" |
| `drawer.backToOverview` | "К обзору" | "Back to overview" |
| `nextSession.label` | "Следующее занятие" | "Next session" |
| `nextSession.joinZoom` | "Подключиться (Zoom)" | "Join Zoom" |
| `nextSession.joinTeams` | "Подключиться (Teams)" | "Join Teams" |
| `nextSession.joinGmeet` | "Подключиться (Google Meet)" | "Join Google Meet" |
| `nextSession.linkPending` | "Ссылка появится ближе к занятию" | "Link will appear closer to the session" |
| `module.lockedNote` | "Откроется {date}" | "Unlocks {date}" |
| `module.allCaughtUp` | "Всё пройдено. Следующий модуль откроется {date}." | "All caught up. Next module unlocks {date}." |
| `presentation.exitConfirm` | "Выйти из режима презентации?" | "Exit presentation mode?" |
| `presentation.emptyNote` | "Материалы появятся до начала занятия" | "Materials will be available before the live session" |
| `workbook.emptyNote` | "Материалы готовятся" | "Workbook materials are being prepared" |
| `homework.uploadCta` | "Загрузить работу" | "Upload submission" |
| `homework.uploadHint` | "До 100 МБ. Сжимайте видео перед отправкой." | "Up to 100 MB. Compress videos before uploading." |
| `homework.studentCommentLabel` | "Комментарий (необязательно)" | "Comment (optional)" |
| `homework.statusPending` | "Ожидает проверки" | "Awaiting review" |
| `homework.statusNeedsRevision` | "На доработку" | "Needs revision" |
| `homework.statusApproved` | "Принято" | "Approved" |
| `homework.statusAutoApproved` | "Автоматически принято" | "Auto-approved" |
| `homework.lateBadge` | "Сдано с опозданием" | "Late" |
| `homework.resubmitCta` | "Перезалить" | "Resubmit" |
| `homework.annotatedByInstructor` | "С пометками преподавателя" | "Annotated by instructor" |
| `homework.deadlineLabel` | "Срок: {date}" | "Due: {date}" |
| `homework.deadlineWarning24h` | "Срок завтра" | "Deadline tomorrow" |
| `account.deleteSection` | "Удаление аккаунта" | "Delete account" |
| `account.deleteCta` | "Удалить мои данные навсегда" | "Delete my data permanently" |
| `account.deleteConfirmTitle` | "Удалить аккаунт?" | "Delete account?" |
| `account.deleteConfirmBody` | "Это действие необратимо. Введите DELETE для подтверждения." | "This action cannot be undone. Type DELETE to confirm." |
| `account.notificationsLabel` | "Email-уведомления" | "Email notifications" |

(Полный список — at implementation time, table растёт. Спека фиксирует
**категории** ключей, а не каждую строку.)

### 5.9 CSS-токены

Новые / обновлённые токены в `src/styles/tokens.css`:

- `--drawer-width: 320px;`
- `--prose-max-width: 800px;` (для workbook / presentation в tab view)
- `--present-max-width: 1200px;` (для presentation mode)
- `--present-h1-size: clamp(48px, 6vw, 64px);`
- `--present-body-size: clamp(20px, 2vw, 24px);`

Light theme — не делаем (deferred stage10).

---

## 6. Background jobs

### 6.1 Cron infrastructure

CF Cron Triggers через `wrangler.toml`:

```toml
[triggers]
crons = [
  "*/15 * * * *",   # auto-approve homework (every 15 min)
  "0 3 * * *",      # retention archival (daily 03:00 UTC)
  "0 4 * * *",      # pre-archive email warning (daily 04:00 UTC)
  "0 5 * * *",      # orphan R2 cleanup (daily 05:00 UTC)
]
```

CF Workers free даёт **5 cron jobs** — мы используем 4.

**Handler entry point** — `src/lib/server/cron/index.ts`:

```ts
export async function scheduled(
  event: ScheduledEvent,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
): Promise<void> {
  const cron = event.cron;  // matches one of crons array
  if (cron === '*/15 * * * *') await runAutoApprove(env);
  else if (cron === '0 3 * * *') await runRetention(env);
  else if (cron === '0 4 * * *') await runPreArchiveEmail(env);
  else if (cron === '0 5 * * *') await runOrphanCleanup(env);
}
```

Astro Cloudflare adapter поддерживает scheduled handlers через
`functions/_worker.ts` экспорт. См. wrangler docs.

**Логирование:** каждый cron run пишет одну строку
`console.log({ cron, processed, errors, duration_ms })` — видно в
`wrangler tail`.

**Error handling:** per-row try/catch. Failed row → `console.error` +
continue. Не падаем cron на одной row.

**Batch size:** 50 rows per pass (D1 read limit comfort). Если больше —
queue до next pass.

### 6.2 Auto-approve homework (`src/lib/server/cron/auto-approve.ts`)

**Trigger:** каждые 15 минут.

**Logic:**
```sql
-- Find pending submissions where next non-cancelled session passed
SELECT hs.id, hs.module_slug, hs.enrollment_id, e.cohort_id
  FROM homework_submissions hs
  JOIN enrollments e ON e.id = hs.enrollment_id
 WHERE hs.status = 'pending'
   AND hs.uploaded_at < (
     SELECT MIN(s.scheduled_at) FROM sessions s
      WHERE s.cohort_id = e.cohort_id
        AND s.module_slug != hs.module_slug
        AND s.order_idx > (
          SELECT order_idx FROM sessions
           WHERE cohort_id = e.cohort_id AND module_slug = hs.module_slug
        )
        AND s.status != 'cancelled'
     )
   AND e.archived_at IS NULL
 LIMIT 50;
```

Для каждой row:
```sql
UPDATE homework_submissions
   SET status = 'auto_approved',
       reviewed_at = unixepoch(),
       updated_at = unixepoch()
 WHERE id = ? AND status = 'pending';  -- conditional, idempotent
```

**Не отправляем feedback email** для auto_approved (системный event).

**Counter:** `processed` row count в log.

### 6.3 Retention archival (`src/lib/server/cron/retention.ts`)

**Trigger:** ежедневно 03:00 UTC.

**Logic:**
```sql
-- Find enrollments past retention window
SELECT e.id, e.cohort_id, e.programme_slug, e.completed_at, e.cancelled_at,
       e.gdpr_delete_requested_at
  FROM enrollments e
 WHERE e.archived_at IS NULL
   AND (
     (e.completed_at IS NOT NULL AND
      unixepoch() > e.completed_at + 30 * 86400)
     OR (e.cancelled_at IS NOT NULL AND
      unixepoch() > e.cancelled_at + 30 * 86400)
     OR (e.gdpr_delete_requested_at IS NOT NULL AND
      e.status IN ('completed','cancelled'))
   )
 LIMIT 50;
```

Для каждой enrollment — **D1 batch transaction**:

1. **Compute stats:**
   ```sql
   SELECT COUNT(*) total, ... FROM homework_submissions WHERE enrollment_id = ?;
   ```
2. **INSERT enrollment_stats** (если не существует).
3. **INSERT curriculum_feedback** (из homework_submissions с
   instructor_comment != NULL, БЕЗ user_id / enrollment_id / submission_id):
   ```sql
   INSERT INTO curriculum_feedback (id, cohort_id, module_slug,
     instructor_id, homework_status, comment_text, original_at)
   SELECT hex(randomblob(16)), ?, hs.module_slug, hs.reviewed_by,
     hs.status, hs.instructor_comment, hs.reviewed_at
     FROM homework_submissions hs
    WHERE hs.enrollment_id = ?
      AND hs.instructor_comment IS NOT NULL;
   ```
4. **UPDATE enrollment SET archived_at = unixepoch()**.
5. **DELETE homework_submissions WHERE enrollment_id = ?**.

**После transaction** (вне batch — best-effort):
6. **R2 delete files** — `env.R2_HOMEWORK.delete(...)` для каждого
   `file_r2_key` + `instructor_annotation_r2_key`. Errors → log,
   continue (orphan cleanup cron подберёт).

**Idempotency:** запрос `WHERE archived_at IS NULL` — second run no-op.

### 6.4 Pre-archive email warning (`src/lib/server/cron/pre-archive-email.ts`)

**Trigger:** ежедневно 04:00 UTC.

**Logic:**
```sql
SELECT e.id, e.user_id, u.email, e.completed_at, e.cancelled_at, u.name
  FROM enrollments e
  JOIN users u ON u.id = e.user_id
 WHERE e.archived_at IS NULL
   AND e.pre_archive_email_sent_at IS NULL
   AND u.deleted_at IS NULL
   AND u.notifications_email = 1
   AND (
     (e.completed_at IS NOT NULL AND
      unixepoch() BETWEEN e.completed_at + 23 * 86400
                      AND e.completed_at + 24 * 86400)
     OR (e.cancelled_at IS NOT NULL AND
      unixepoch() BETWEEN e.cancelled_at + 23 * 86400
                      AND e.cancelled_at + 24 * 86400)
   )
 LIMIT 50;
```

Для каждой row:
1. **Send email via Resend** — template "pre-archive-warning":
   - Subject: "Your homework submissions will be removed in 7 days"
   - Body: download link `/dashboard/homework` + дата archival.
2. **UPDATE enrollments SET pre_archive_email_sent_at = unixepoch()**
   (idempotency).

Errors на Resend API → не set sent_at → next run retry.

### 6.5 Orphan R2 cleanup (`src/lib/server/cron/orphan-cleanup.ts`)

**Trigger:** ежедневно 05:00 UTC.

**Limitation:** wrangler R2 binding не имеет `list()` через worker
для arbitrary prefix scan на free tier. Используем S3-compatible API
через aws4fetch (R2 access keys в wrangler secrets).

**Logic:**

1. **List R2 objects** prefix `homework/` (через S3 LIST):
   ```ts
   const objects = await s3ListObjects({ prefix: 'homework/' });
   ```
2. **Batch check D1** — для каждых 100 объектов:
   ```sql
   SELECT file_r2_key, instructor_annotation_r2_key
     FROM homework_submissions
    WHERE file_r2_key IN (?, ?, ...)
       OR instructor_annotation_r2_key IN (?, ?, ...);
   ```
3. **Compute orphans:** R2 object не в результате + uploaded > 24h ago.
4. **R2 delete** orphan files.

**Batch size limit:** до 1000 objects per cron run. Если больше —
defer до next day.

**Note:** не критичный cron — orphans занимают R2 storage, но не
бьют функционал. При жалобе на R2 storage usage — увеличиваем частоту.

### 6.6 Cron observability

Все cron handlers пишут структурированный лог:
```ts
console.log(JSON.stringify({
  ts: new Date().toISOString(),
  cron: 'auto-approve',
  processed: 5,
  errors: 0,
  duration_ms: 234,
}));
```

`wrangler tail` показывает в production. Sprint 2+ — agg в Logpush или
external observability (отдельный stage, не в MVP).

---


## 7. LK_CONFIG

**File:** `src/lib/config/lk.ts` (renamed from `student-lk.ts` —
shared между student и instructor сторонами).

```ts
/**
 * Centralized config для Student LK + Instructor LK.
 * Все timing / limits / thresholds — здесь. Изменения = code change → deploy.
 * Per-cohort параметры (cadence, session days, time_et) — в cohort_slots.
 * Secrets — в wrangler secrets (Resend API key, R2 keys).
 */
export const LK_CONFIG = {
  // --- Unlock / completion ---
  unlock_lead_hours: 6,                  // module открывается за N часов до session.scheduled_at
  theory_auto_done_delay_hours: 1,       // theory module → done через N часов после session.scheduled_at

  // --- Homework upload ---
  homework_upload_cap_bytes: 100 * 1024 * 1024,  // 100 MB
  homework_deadline_warning_hours: 24,           // amber badge "Срок завтра"
  signed_url_expiration_hours: 24,               // pre-signed PUT URL (R2 upload)
  signed_get_url_ttl_seconds: 3600,              // R2 GET URL для playback/download

  // --- Homework review ---
  student_comment_max_chars: 2000,
  instructor_comment_max_chars: 10000,

  // --- Retention ---
  retention_grace_days: 30,                       // после completed_at / cancelled_at
  pre_archive_email_days_before: 7,
  gdpr_delete_mode: 'on_completion' as const,     // 'immediate' | 'on_completion'

  // --- UI ---
  drawer_width_px: 320,
  drawer_edge_swipe_zone_px: 20,
  zoom_join_window_minutes_before: 15,            // когда "Join meeting" button active

  // --- Cron ---
  cron_batch_size: 50,                            // rows per pass
  orphan_cleanup_max_objects_per_run: 1000,
} as const;

export type LkConfig = typeof LK_CONFIG;
```

Все импорты в коде:
```ts
import { LK_CONFIG } from '@/lib/config/lk';
```

**Per-cohort параметры** (не в config, в D1):
- `cohorts.meeting_provider`, `meeting_url`, `meeting_host_url`,
  `modules_snapshot_json`.
- `cohort_slots.days_json`, `time_et`.

---

## 8. Stage breakdown

7 stages с зависимостями. Каждый stage — отдельный план в
`.agent/plans/active/` + git commits с git mv в `done/` после
финального коммита (per PLANS LIFECYCLE).

### Stage A — Schema migrations + backfill

**Цель:** все таблицы и колонки в production, existing data в новом формате.

**Включает:**
- M1: `0011_sessions.sql` — CREATE sessions + cohorts.meeting_*.
- M2: `0012_modules_split.sql` — ADD presentation_r2_key + workbook_r2_key.
- M3: script `migrate-modules-bodies.mjs` — copy R2 keys, concat
  homework_md в workbook.md в R2.
- M4: `0013_modules_cleanup.sql` — DROP body_r2_key + homework_md.
- M5: `0014_homework_submissions.sql` — CREATE 3 таблицы.
- M6: `0015_enrollments_extensions.sql` — ALTER 3 таблицы.
- M7: `0016_module_progress_rename.sql` — RENAME status → view_status.
- M8: script `backfill-cohort-modules-snapshot.mjs` — populate
  existing cohorts.modules_snapshot_json.
- M9: script `backfill-sessions.mjs` — auto-generate sessions для
  existing active cohorts.

**Verify:**
- `pnpm typecheck` (db/types.ts обновлён).
- `pnpm check:r2-d1` (validator не упал).
- Все existing /dashboard страницы рендерятся без ошибок (хотя ещё на
  старом UI).

**Не блокирует production** — старый stage26 код работает через
`workbook_r2_key` после backfill (он берётся вместо `body_r2_key`).

**Блокирует:** все последующие stages.

### Stage B — Sessions + unlock refactor

**Цель:** заменить sequential unlock на schedule-based.

**Включает:**
- Helper `getUnlockState(env, enrollmentId, moduleSlug)` —
  reads enrollment_modules.unlock_override_at + sessions.scheduled_at.
- Refactor `listEnrollmentModules` + `getModuleForStudent` в
  `src/lib/server/student-modules.ts`.
- Удалить `markModuleComplete` + `POST /api/student/modules/[slug]/complete`.
- Refactor `getCurrentEnrollmentProgress` — current = first unlocked
  not-done.
- "All caught up" card в `dashboard/index.astro` paid view.
- Late enrollment notice banner.

**Verify:**
- E2E: student с awaiting → paid status видит unlocked модули
  согласно sessions.
- Backward unlock работает (все past sessions modules open).
- Override unlock через manual SQL → reflected в UI.

**Зависит от:** Stage A.

**Блокирует:** Stage C (homework deadlines зависят от sessions),
Stage D (instructor override UI зависит от helpers).

### Stage C — Homework submission (student-side)

**Цель:** student может upload ДЗ + видеть feedback + resubmit.

**Включает:**
- API endpoints (§ 4.2):
  - `POST /api/student/homework/upload-url`
  - `POST /api/student/homework/submissions` (finalize)
  - `GET /api/student/homework/submissions/[id]/file-url`
  - `GET /api/student/homework/submissions/[id]/annotation-url`
  - `POST /api/student/homework/last-seen`
- Pre-signed URL генерация через aws4fetch + R2 access keys в wrangler
  secrets.
- Helpers в `src/lib/server/homework.ts`.
- UI компоненты:
  - `SubmissionUploader.astro` (pre-signed PUT flow + progress).
  - `SubmissionCard.astro`.
- Aggregate `/dashboard/homework` page.
- Tabs split в `modules/[slug].astro` (см. Stage F для drawer
  integration).

**Verify:**
- Upload 50 MB видео → finalize → appears in /dashboard/homework как
  pending.
- Resubmit после instructor review → new row.
- Late submission получает `is_late=true`.

**Зависит от:** Stage A (schema), Stage B (для deadline computation
through sessions).

### Stage D — Homework review (instructor-side minimal)

**Цель:** instructor может закрыть feedback loop.

**Включает:**
- API endpoints (§ 4.3):
  - `POST /api/instructor/homework/submissions/[id]/review`
  - `POST /api/instructor/homework/submissions/[id]/annotation-upload-url`
  - `POST /api/instructor/homework/submissions/[id]/annotation-finalize`
  - `POST /api/instructor/enrollment-modules/.../unlock-override`
  - `DELETE /api/instructor/enrollment-modules/.../unlock-override`
- Page `/[locale]/instructor/homework/[id]` — review UI:
  - File preview (Vidstack для video, iframe для PDF, img для image,
    download для остального).
  - Comment textarea (markdown).
  - Annotated copy upload (опционально).
  - Submit → status set + email via Resend.
- Обновить `/instructor/index.astro` — real data вместо stub:
  - Pending count = `SELECT COUNT(*) FROM homework_submissions
    WHERE status='pending' AND priority='normal' AND
    enrollment.lead_instructor_id = current_user`.
  - Pending cards links на review page.
  - Reviewed this week real count.
  - Next session real data.
- Override UI: confirm modal с typing "OVERRIDE" в
  `/instructor/students/[id]` minimal page (или drawer modal).
- Resend integration — feedback email template
  `templates/feedback.html`.

**Verify:**
- Instructor открыл pending → approved → student получил email +
  in-app badge.
- Annotated copy upload → student видит обе версии.
- Override action работает + audit log entry.

**Зависит от:** Stage A, B, C.

### Stage E — Drawer + Tabs + Presentation mode + Icons

**Цель:** UI overhaul по решениям Q5+Q7+Q9.

**Включает:**
- `ModulesDrawer.astro` + integration в `DashboardLayout`.
- `ModuleTabs.astro` + integration в `dashboard/modules/[slug].astro`.
- `PresentationLayout.astro` + page `dashboard/modules/[slug]/present`.
- `MarkdownContent.astro` + YT extension в
  `src/lib/markdown/extensions/youtube.ts`.
- `ConfirmModal.astro` (reused для exit + GDPR delete + override).
- Icons folder `src/components/icons/` — 10 Phosphor Thin компонентов.
- Заменить все Unicode emoji (D7) на icon components.
- DashboardNav update (убираем Modules link, добавляем hamburger).

**Verify:**
- Drawer работает permanent на desktop, overlay на mobile.
- Tab swipe работает на mobile, sticky на desktop.
- Presentation mode keyboard navigation OK.
- YT URLs в markdown body превращаются в lite-load embeds.
- Все юникод-иконки заменены.

**Зависит от:** Stage A.

**Не блокирует C/D**, но рекомендуется delivered после C/D для consistency
финального UX.

### Stage F — Cron jobs + retention pipeline

**Цель:** automated lifecycle management.

**Включает:**
- Wrangler `[triggers]` config с 4 cron lines.
- Handler entry `src/lib/server/cron/index.ts`.
- 4 cron modules:
  - `cron/auto-approve.ts`
  - `cron/retention.ts`
  - `cron/pre-archive-email.ts`
  - `cron/orphan-cleanup.ts`
- Resend templates для pre-archive warning.
- `POST /api/account/delete` (GDPR endpoint, § 4.2).
- Account UI section (delete button + confirm modal).
- Notifications toggle UI в /account.

**Verify:**
- Stub data: создать pending submission с
  `uploaded_at < next_session.scheduled_at − 1h` → cron run → status
  auto_approved.
- Manual mark enrollment.completed_at = now − 31 days → cron → archived.
- GDPR delete with on_completion mode → flag set, остается active.
- Orphan R2 file (без D1 row) → удаляется next day cron.

**Зависит от:** Stage A, C, D.

### Stage G — Polish + production rollout

**Цель:** production-ready.

**Включает:**
- Все existing tests passing.
- New E2E tests Playwright:
  - student upload + finalize.
  - instructor review + approve.
  - drawer + tabs navigation.
  - presentation mode + Esc confirm.
- Manual QA full flow на preview deploy.
- Документация update:
  - `docs/methodist-modules-guide.md` — split body → presentation+workbook
    workflow.
  - `docs/student-lk-spec.md` → replaced by this file.
- Production deploy (lottoprof explicit "go" required per CLAUDE.md
  auto-mode rules).

**Зависит от:** все предыдущие stages.

---

## 9. Migration plan — detailed

Все migrations в `migrations/` (top-level). Применяются через
`wrangler d1 migrations apply`. Scripts — отдельные `.mjs` файлы.

**Order — critical**, executed sequentially per stage A.

### M1: `0011_sessions.sql`

```sql
-- Sessions per cohort + cohort meeting fields
PRAGMA foreign_keys = ON;
CREATE TABLE sessions (...);  -- см. § 2.1
CREATE INDEX idx_sessions_cohort_order ...;

ALTER TABLE cohorts ADD COLUMN meeting_provider TEXT NOT NULL DEFAULT 'zoom'
  CHECK(meeting_provider IN ('zoom','teams','gmeet','other'));
ALTER TABLE cohorts ADD COLUMN meeting_url TEXT;
ALTER TABLE cohorts ADD COLUMN meeting_host_url TEXT;
ALTER TABLE cohorts ADD COLUMN modules_snapshot_json TEXT NOT NULL DEFAULT '[]';
```

**Rollback (dev only):** `DROP TABLE sessions; ALTER TABLE cohorts DROP COLUMN meeting_*;`

### M2: `0012_modules_split.sql`

```sql
ALTER TABLE modules ADD COLUMN presentation_r2_key TEXT;
ALTER TABLE modules ADD COLUMN workbook_r2_key TEXT;
```

Колонки добавляются nullable — после M3 backfill становятся фактически
non-null (constraint check можно добавить позже когда уверены что все
заполнены).

### M3: `scripts/migrate-modules-bodies.mjs`

Pseudo-code:
```js
for (const row of await db.prepare('SELECT slug, locale, body_r2_key, homework_md FROM modules').all()) {
  const oldKey = row.body_r2_key;
  const newWorkbookKey = `modules/${row.slug}/workbook.${row.locale}.md`;

  // 1. Copy R2 body → new workbook key
  const body = await r2.get(oldKey);
  let content = await body.text();

  // 2. Concat homework_md в конец как новая секция
  if (row.homework_md && row.homework_md.trim()) {
    content += `\n\n## Домашнее задание\n\n${row.homework_md}\n`;
    // Note: ## title локализован — для en версии должен быть "Homework"
    // (см. реальный script — locale-aware concatenation)
  }

  // 3. Put new key
  await r2.put(newWorkbookKey, content);

  // 4. Update D1
  await db.prepare('UPDATE modules SET workbook_r2_key = ? WHERE slug = ? AND locale = ?')
    .bind(newWorkbookKey, row.slug, row.locale).run();

  // 5. presentation_r2_key — pointer на пустой placeholder
  // (methodist потом upload реальный)
  await db.prepare('UPDATE modules SET presentation_r2_key = ? WHERE slug = ? AND locale = ?')
    .bind(`modules/${row.slug}/presentation.${row.locale}.md`, row.slug, row.locale).run();
}
```

**Verify:** `pnpm check:r2-d1` (validator не upset).

### M4: `scripts/apply-modules-cleanup.mjs` (NOT a migration)

**Refactored 2026-06-07:** M4 — НЕ миграция. Wrangler `migrations
apply` запускает все pending одной командой, поэтому migration 0013
drop'нула бы columns ДО M3 data migration → data loss.

Script с pre-checks:
1. presentation_r2_key + workbook_r2_key columns exist.
2. workbook_r2_key NOT NULL для всех modules (M3 success).
3. Если old columns уже не существуют — exit 0 (idempotent).

```ts
// scripts/apply-modules-cleanup.mjs (упрощённо)
ALTER TABLE modules DROP COLUMN body_r2_key;
ALTER TABLE modules DROP COLUMN homework_md;
```

Запускается:
```bash
node scripts/apply-modules-cleanup.mjs --local   # после M3 local verify
node scripts/apply-modules-cleanup.mjs --remote  # после M3 production verify
```

### M5: `0014_homework_submissions.sql`

```sql
CREATE TABLE homework_submissions (...);  -- см. § 2.1
CREATE TABLE enrollment_stats (...);
CREATE TABLE curriculum_feedback (...);
CREATE INDEX ...;
```

### M6: `0015_enrollments_extensions.sql`

```sql
ALTER TABLE enrollments ADD COLUMN cancelled_at INTEGER;
ALTER TABLE enrollments ADD COLUMN archived_at INTEGER;
ALTER TABLE enrollments ADD COLUMN gdpr_delete_requested_at INTEGER;
ALTER TABLE enrollments ADD COLUMN pre_archive_email_sent_at INTEGER;
ALTER TABLE enrollments ADD COLUMN homework_last_seen_at INTEGER;

ALTER TABLE enrollment_modules ADD COLUMN unlock_override_at INTEGER;
ALTER TABLE enrollment_modules ADD COLUMN unlock_override_by TEXT REFERENCES users(id);
ALTER TABLE enrollment_modules ADD COLUMN unlock_override_reason TEXT;

ALTER TABLE users ADD COLUMN deleted_at INTEGER;
ALTER TABLE users ADD COLUMN notifications_email INTEGER NOT NULL DEFAULT 1;
```

### M7: `0016_module_progress_rename.sql`

```sql
ALTER TABLE module_progress RENAME COLUMN status TO view_status;
-- Semantic: not_started → viewed (после первого open)
-- В коде helper markModuleOpened продолжает работать, просто column name
-- change.
UPDATE module_progress
   SET view_status = CASE
     WHEN view_status = 'done' THEN 'viewed'   -- 'done' больше не используется
     WHEN view_status = 'in_progress' THEN 'viewed'
     ELSE view_status
   END;
```

### M8: `scripts/backfill-cohort-modules-snapshot.mjs`

```js
for (const cohort of await db.prepare('SELECT id, programme_slug FROM cohorts').all()) {
  const programme = await getProgrammeContent(cohort.programme_slug);
  const snapshot = JSON.stringify(programme.default_modules);
  await db.prepare('UPDATE cohorts SET modules_snapshot_json = ? WHERE id = ?')
    .bind(snapshot, cohort.id).run();
}
```

### M9: `scripts/backfill-sessions.mjs`

```js
for (const cohort of await db.prepare(`
  SELECT c.id, c.start_date, c.modules_snapshot_json,
         cs.days_json, cs.time_et
  FROM cohorts c
  JOIN cohort_slots cs ON cs.id = c.slot_id
  WHERE c.status IN ('open','running')
`).all()) {
  const modules = JSON.parse(cohort.modules_snapshot_json);
  const sessionDates = computeSessionDates({
    startDate: cohort.start_date,
    sessionsCount: modules.length,
    days: JSON.parse(cohort.days_json),
    timeEt: cohort.time_et,
  });

  for (let i = 0; i < modules.length; i++) {
    await db.prepare(`
      INSERT INTO sessions (id, cohort_id, module_slug, order_idx,
        scheduled_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'scheduled', unixepoch(), unixepoch())
    `).bind(crypto.randomUUID(), cohort.id, modules[i], i, sessionDates[i]).run();
  }
}
```

**Helper `computeSessionDates`:**
- Input: startDate (unix), sessionsCount, days array (e.g. ['mon', 'thu']),
  timeEt (e.g. '14:00').
- Output: array of unix timestamps, DST-aware per session date.
- Использует `date-fns-tz` или `Temporal`.

### Pre-deploy checklist

- [ ] D1 backup (через wrangler export) перед production migrations.
- [ ] Local dev D1 — все миграции прогнаны и passed.
- [ ] All M3/M8/M9 scripts проверены на dev D1 + local R2.
- [ ] `pnpm typecheck` зелёный (db/types.ts обновлён).
- [ ] `pnpm check:r2-d1` зелёный.
- [ ] Production migrations выполняются в low-traffic window.
- [ ] После migrations — manual smoke test student dashboard на production.

---

## 10. Out of scope / future migrations

### 10.1 Vne scope MVP (зафиксировано в § 1 Non-goals)

См. полный список в § 1.

### 10.2 Future migrations

Перенос из `student-lk-v2-discovery.md` § 5. Trigger'ы и rationale —
смотреть discovery.

| Feature | Trigger миграции |
|---|---|
| Cloudflare Stream для video transcoding | Жалоба студента "не могу сжать до 100 MB" |
| Whisper транскрипция sessions | Запрос на пересмотр + текстовые ноты |
| Workers Paid plan ($5/мес) | R2 >50 GB или upload через worker proxy |
| Browser push notifications | Запрос на real-time feedback |
| CF Email Service native sending | После перехода на Workers Paid |
| Vimeo embed + кастомный синтаксис | Methodist хочет Vimeo |
| Slide-by-slide presentation mode | Запрос keynote-style |
| Timestamp markers для homework review | Запрос precise feedback по timecode |
| Read-position scroll tracking | Workbooks 30+ экранов |
| Co-instructors per cohort | Реальный кейс 2+ instructors на cohort |
| Mass feedback templates | Запрос preподa на скорость review |
| Per-student private instructor notes | Запрос на handoff между instructors |
| Calendar view sessions | Жалобы на list view UX |
| LLM pre-check для homework | Когда ляжет budget на LLM integration |
| Cohort detail page `/instructor/cohorts/[id]` (matrix) | Instructor LK v2 full delivery |
| Module composer для individual programmes | Первый individual student |

### 10.3 Instructor LK v2 — отложен

Полный instructor overhaul (cohorts grid, matrix view, students list,
sessions calendar, account templates) — отдельный round после Student
MVP в проде. Spec: `instructor-lk-v2-discovery.md`.

В этом раунде delivered только **minimal instructor endpoints**
необходимые для closing student feedback loop (§ Stage D).

---

**End of spec.**

