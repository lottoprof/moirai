-- 0019 — Cohort conflict policy Q8 (display параллельных cohorts клиенту)
--
-- Decision: cohort-conflict-policy-discussion Q8 = D (см. archive 2026-06-11).
-- Клиент видит cohort'ы как "Group A / Group B" без instructor names.
-- Backend выбирает по admin priority + round-robin fallback.
--
-- Fields:
--   public_priority — sort order (lower = first). NULL = в конце.
--   public_label    — optional override "Group A" / "Group B" label.
--                     Если NULL — UI генерирует index per (programme, start_date).
--
-- Admin задаёт через /admin/cohorts/[id].

ALTER TABLE cohorts ADD COLUMN public_priority INTEGER;
ALTER TABLE cohorts ADD COLUMN public_label TEXT;

CREATE INDEX idx_cohorts_public_priority
  ON cohorts(programme_id, start_date, public_priority);
