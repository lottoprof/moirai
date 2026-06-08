# Admin: Instructor management

> Status: done. Code merged 2026-06-08. Deploy pending user confirmation.
>
> Spec не было в docs/decisions — этот план становится source of truth.
> После reшения: добавим раздел в `docs/Architecture.md` (§ Instructor zone)
> и manifest строку в `.agent/rules/decisions.md`.

---

## Бизнес-правила

1. **Quolification:** instructor имеет qualification по конкретным
   модулям (`instructor_qualifications` M2M). Admin может назначить
   instructor'а на cohort только если он quolified по ВСЕМ модулям
   programme cohort'ы.
2. **Assignment cohort'е:** admin назначает `cohorts.lead_instructor_id`
   через UI с фильтрованным dropdown'ом (qualified + time-available).
3. **Warning:** cohort с активными enrollments + `lead_instructor_id = NULL`
   → красный badge на /admin/cohorts + список "Cohorts needing instructor".
4. **Checkout:** если cohort без lead_instructor — НЕ блокируем
   (soft warn в admin). Student всё равно может купить (Q2=A).
5. **Sickness (per-session):** admin задаёт `sessions.substitute_instructor_id`
   на конкретные sessions. Substitute должен быть qualified для модуля
   данной session'ы. Cohort lead'а это не меняет.
6. **Resignation/handover:** admin триггерит на /admin/users/[id]
   action "Handover cohorts" → для каждой active cohort'ы где user = lead
   выбирает нового lead'а из qualified. Forward-only — прошлые sessions
   остаются на старом в audit.
7. **Account delete блокируется** если user — lead_instructor в любой
   open/running cohort'е. UI: "X cohorts blocking deletion. Contact admin."

## Schema (migration 0018)

```sql
-- instructor_qualifications: M2M instructor × module
CREATE TABLE instructor_qualifications (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_slug  TEXT NOT NULL,
  granted_by   TEXT NOT NULL REFERENCES users(id),
  granted_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, module_slug)
);
CREATE INDEX idx_instructor_qual_module ON instructor_qualifications(module_slug);

-- cohorts.lead_instructor_id (explicit, не косвенно через slot)
ALTER TABLE cohorts ADD COLUMN lead_instructor_id TEXT REFERENCES users(id);
CREATE INDEX idx_cohorts_lead ON cohorts(lead_instructor_id);

-- Backfill из slots для существующих cohorts
UPDATE cohorts
   SET lead_instructor_id = (SELECT instructor_id FROM slots WHERE slots.id = cohorts.slot_id)
 WHERE lead_instructor_id IS NULL;

-- sessions.substitute_instructor_id (per-session override)
ALTER TABLE sessions ADD COLUMN substitute_instructor_id TEXT REFERENCES users(id);
```

`enrollments.lead_instructor_id` — оставляем как есть (уже в схеме),
синхронизация с cohorts.lead_instructor_id на момент handover'а
происходит явно через UI action.

## Stages

### S1 — Migration 0018 + db/types.ts

- Migration 0018 как выше.
- `db/types.ts`: `InstructorQualificationRow`, `CohortRow` расширен
  `lead_instructor_id`, `SessionRow` расширен `substitute_instructor_id`.

### S2 — Server helpers (`src/lib/server/admin-instructors.ts`)

- `listInstructorsWithQualifications(env)` → таблица user × quolified module count
- `getInstructorQualifications(env, userId)` → Set<module_slug>
- `setInstructorQualifications(env, userId, slugs, grantedBy)` — full replace
- `findQualifiedInstructors(env, moduleSlugs, conflictWindow)` → filter by
  qualification + no time conflict в указанном window
- `checkAccountDeleteBlocked(env, userId)` → list of cohort_id where user
  is lead AND cohort.status IN ('open','running')

### S3 — /admin/instructors UI

- Page: `src/pages/admin/instructors/index.astro`
  * Список всех users с role='instructor': имя, email, count qualified
    modules, count active cohorts as lead
- Detail: `src/pages/admin/instructors/[id].astro`
  * Matrix: programme rows × module checkboxes
  * Save → POST /api/admin/instructors/[id]/qualifications

### S4 — Cohort assignment + warning UI

- Расширить existing /admin/cohorts (если есть) или добавить раздел
  "Cohorts needing instructor" с красным badge'ом.
- Per cohort: dropdown qualified instructors (server pre-filter).
  POST /api/admin/cohorts/[id]/assign-instructor.

### S5 — Session substitute UI

- `/admin/cohorts/[id]/sessions` или inline на cohort detail.
- Per session row: "Substitute" select из qualified для модуля session.
- POST /api/admin/sessions/[id]/substitute.

### S6 — Handover flow

- На /admin/users/[id] (если есть) — кнопка "Handover all cohorts".
- Modal: каждая active cohort × dropdown нового lead'а (qualified).
- POST /api/admin/users/[id]/handover (batch).

### S7 — Account delete block

- Расширить `/api/account/delete` (existing endpoint) — pre-check
  через `checkAccountDeleteBlocked`. 409 если есть blocking cohorts.
- В /account page показать список blocking cohorts ("contact admin"
  на каждой) когда user пытается удалить, через UI hint.

### S8 — Soft warn на checkout (Q2=A)

- В checkout page (src/pages/[locale]/checkout.astro): если cohort
  без `lead_instructor_id` — показать тонкий info-banner
  "Instructor pending — will be assigned before sessions start".
- Никаких блокировок.

### S9 — Документация

- Добавить раздел в `docs/Architecture.md` (§ Instructor zone) с этим
  спецом — чтобы в следующий раз не пришлось переоткрывать.
- Manifest строка в `.agent/rules/decisions.md`.

## Out of scope (deferred)

- `instructor_unavailability` table (плановые отпуска / болезни без
  явного session-level назначения) — отложим до реальной потребности.
- Notification preподу при назначении (Sprint 2 email/digest).
- Time conflict detection across **programmes** (sessions
  пересекаются между slot'ами) — детект только в пределах одной
  cohort'ы сейчас, расширим если будет конфликт.

## Deploy

После всех S1-S8 — один production deploy + apply migration 0018.

## Lifecycle

После всех stages → `git mv` плана в done/.
