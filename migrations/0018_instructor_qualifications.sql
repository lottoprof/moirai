-- 0018 — Instructor management (admin-instructor-management plan).
--
-- Содержание:
--   1. instructor_qualifications — M2M user × module (квалификация
--      preподa по конкретным module slugs)
--   2. cohorts.lead_instructor_id — явное поле (раньше unhomy
--      косвенно через slots.instructor_id) + backfill для existing
--   3. sessions.substitute_instructor_id — per-session override
--      (для болезней без смены lead'а cohort'ы)
--
-- Бизнес-правила (см. .agent/plans/active/admin-instructor-management.md):
-- - Admin assigns lead_instructor только из qualified по ВСЕМ модулям
--   programme cohort'ы.
-- - Substitute_instructor_id должен быть qualified по module sessions.
-- - При попытке delete account — block если user = lead в open/running.
--
-- Rollback не предусмотрен (Architecture: миграции иммутабельны после
-- коммита). Если ошиблись — fix-forward через 0019.

CREATE TABLE instructor_qualifications (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_slug  TEXT NOT NULL,
  granted_by   TEXT NOT NULL REFERENCES users(id),
  granted_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, module_slug)
);

CREATE INDEX idx_instructor_qual_module ON instructor_qualifications(module_slug);

ALTER TABLE cohorts ADD COLUMN lead_instructor_id TEXT REFERENCES users(id);

CREATE INDEX idx_cohorts_lead ON cohorts(lead_instructor_id);

UPDATE cohorts
   SET lead_instructor_id = (
     SELECT s.instructor_id FROM slots s WHERE s.id = cohorts.slot_id
   )
 WHERE lead_instructor_id IS NULL;

ALTER TABLE sessions ADD COLUMN substitute_instructor_id TEXT REFERENCES users(id);
