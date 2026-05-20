-- Migration: 0009_apply_flow.sql
-- Date:      2026-05-20
-- Spec:      docs/apply-flow-spec.md (FLOW-1..31, 53/53 вопросов)
-- Rollback:  (dev only) DROP TABLE applications;
--                       DROP TABLE cohorts;
--                       DROP TABLE slots;
--                       ALTER TABLE users DROP COLUMN marketing_opt_in;
--
-- Stage 14a — фундамент Apply flow:
--   1. slots          — admin-конфиг расписания (programme × days × time × instructor)
--   2. cohorts        — auto-published runs из slots на 12 мес вперёд (FLOW-7)
--   3. applications   — заявки клиентов с lifecycle status machine (FLOW-22)
--   4. users          — добавляем marketing_opt_in (FLOW-31)
--
-- Lifecycle status machine для applications (FLOW-22):
--   awaiting_payment → paid → running → completed
--                  ↘ cancelled (любая стадия → terminal)
--                  ↘ expired   (awaiting_payment + cohort стартовала без оплаты)
--                  ↘ refunded  (paid → refund по FLOW-9a)
--
-- Counter-поля (apply_count, paid_count в cohorts) поддерживаются
-- в app-коде (src/lib/server/applications.ts), а не триггерами —
-- проще debug и тестирование транзитов status'ов.

PRAGMA foreign_keys = ON;

-- ============================================================
-- slots — admin-конфиг расписания (FLOW-30)
-- ============================================================
-- programme_id — slug из Content Collection (`beginner`, `intermediate`, ...),
-- НЕ FK (programmes — статичный контент, soft-validation в коде).
--
-- days_json — JSON array weekday codes: '["mon","thu"]'. UI рендерит
-- через Intl.DateTimeFormat per locale (FLOW-30: no hardcoded enums).
--
-- time_et — фикс ET, формат 'HH:MM' (FLOW-26). UI показывает только ET,
-- без TZ-конвертации под клиента.
--
-- instructor_id — FK users(id), может быть NULL (slot не назначен).
-- ON DELETE SET NULL — если инструктора удалили, slot остаётся
-- (admin вручную переназначит).
--
-- active = 0 → slot скрыт из публичной grid'a, новые cohorts не публикуются.
-- Existing cohorts продолжают работать (см. cohorts.status).
CREATE TABLE slots (
  id              TEXT PRIMARY KEY,                                          -- UUID
  programme_id    TEXT NOT NULL,                                             -- 'beginner'|'intermediate'|'bundle'|'individual'
  days_json       TEXT NOT NULL,                                             -- '["mon","thu"]'
  time_et         TEXT NOT NULL,                                             -- 'HH:MM'
  instructor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  max_students    INTEGER NOT NULL DEFAULT 10,
  active          INTEGER NOT NULL DEFAULT 1
                  CHECK(active IN (0, 1)),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_slots_programme    ON slots(programme_id);
CREATE INDEX idx_slots_instructor   ON slots(instructor_id)
  WHERE instructor_id IS NOT NULL;
CREATE INDEX idx_slots_active       ON slots(active)
  WHERE active = 1;

-- ============================================================
-- cohorts — auto-published runs (FLOW-7)
-- ============================================================
-- Один cohort = одна конкретная "когорта" программы со start_date.
-- Создаются скриптом scripts/publish-cohorts.mjs из active slots
-- на горизонт 12 месяцев вперёд (FLOW-7).
--
-- end_date — denormalized, вычисляется при INSERT как
-- start_date + ROUND(programme.lessons_total / 2) недель (FLOW-8).
-- При изменении programme.lessons_total нужен manual recompute
-- (Sprint 2: admin LK + миграция данных).
--
-- status (FLOW-22 для cohort, отличается от application status):
--   open       — приём applications (default при INSERT)
--   running    — start_date наступил, курс идёт
--   completed  — end_date наступил, курс закончен
--   cancelled  — admin отменил (instructor болен и т.п.)
--
-- apply_count / paid_count — denormalized counters, maintained app-side
-- в applications.ts helpers (createApplication ++apply_count,
-- markAsPaid ++paid_count, cancelApplication --apply_count etc.)
CREATE TABLE cohorts (
  id              TEXT PRIMARY KEY,                                          -- UUID
  programme_id    TEXT NOT NULL,
  slot_id         TEXT NOT NULL REFERENCES slots(id) ON DELETE RESTRICT,
  start_date      INTEGER NOT NULL,                                          -- unix sec, midnight UTC
  end_date        INTEGER NOT NULL,                                          -- unix sec, computed at publish
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK(status IN ('open', 'running', 'completed', 'cancelled')),
  apply_count     INTEGER NOT NULL DEFAULT 0,
  paid_count      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_cohorts_programme         ON cohorts(programme_id);
CREATE INDEX idx_cohorts_slot              ON cohorts(slot_id);
CREATE INDEX idx_cohorts_start             ON cohorts(start_date);
CREATE INDEX idx_cohorts_status            ON cohorts(status);
CREATE INDEX idx_cohorts_programme_status  ON cohorts(programme_id, status);

-- ============================================================
-- applications — заявки клиентов (FLOW-22 status machine)
-- ============================================================
-- 1 user × 1 programme — может быть **множество** applications во
-- времени (re-take после completed/cancelled — FLOW-25), но **только
-- одна одновременно active** (status IN (awaiting_payment, paid, running)).
-- Это enforced uniqueness через partial unique index ниже.
--
-- enrollment_id — NULL пока application НЕ paid. После webhook'a
-- /api/stripe/webhook создаёт enrollment row + связывает FK.
--
-- terms_version / refund_version / privacy_version — snapshot на момент
-- checkout (FLOW-2): нужны для GDPR proof of consent при споре.
-- Текущая версия документов читается из frontmatter legal/*.mdx при
-- checkout и фиксируется здесь.
--
-- stripe_session_id / stripe_payment_id — для reconciliation со Stripe
-- dashboard'ом, refund processing, и audit trail.
CREATE TABLE applications (
  id                  TEXT PRIMARY KEY,                                          -- UUID
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  programme_id        TEXT NOT NULL,
  cohort_id           TEXT NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT,
  enrollment_id       TEXT REFERENCES enrollments(id) ON DELETE SET NULL,        -- NULL пока не paid
  status              TEXT NOT NULL DEFAULT 'awaiting_payment'
                      CHECK(status IN (
                        'awaiting_payment', 'paid', 'running', 'completed',
                        'cancelled', 'expired', 'refunded'
                      )),
  -- Apply form snapshot (FLOW-27)
  country             TEXT,                                                       -- ISO 3166-1 alpha-2, optional
  -- Checkout snapshots (FLOW-18, FLOW-31)
  marketing_opt_in    INTEGER NOT NULL DEFAULT 0
                      CHECK(marketing_opt_in IN (0, 1)),
  age_confirmed       INTEGER NOT NULL DEFAULT 0
                      CHECK(age_confirmed IN (0, 1)),
  terms_version       TEXT,                                                       -- зафиксировано при checkout
  refund_version      TEXT,
  privacy_version     TEXT,
  -- Stripe references (FLOW-9, E5)
  stripe_session_id   TEXT,                                                       -- cs_test_... / cs_live_...
  stripe_payment_id   TEXT,                                                       -- pi_test_... / pi_live_...
  amount_cents        INTEGER,                                                    -- snapshot цены при checkout
  currency            TEXT,                                                       -- ISO 4217
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX idx_applications_user         ON applications(user_id);
CREATE INDEX idx_applications_cohort       ON applications(cohort_id);
CREATE INDEX idx_applications_programme    ON applications(programme_id);
CREATE INDEX idx_applications_status       ON applications(status);
CREATE INDEX idx_applications_stripe_sess  ON applications(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- FLOW-25 enforcement: один user не может иметь >1 active application
-- на одну и ту же programme. "Active" = status IN (awaiting_payment, paid, running).
-- Partial unique index гарантирует на DB-уровне.
CREATE UNIQUE INDEX uniq_applications_active_per_programme
  ON applications(user_id, programme_id)
  WHERE status IN ('awaiting_payment', 'paid', 'running');

-- ============================================================
-- users — добавляем marketing_opt_in (FLOW-31)
-- ============================================================
-- Default 0 (GDPR-friendly opt-in, не opt-out).
-- Set'ится клиентом при checkout если чекбокс отмечен.
-- Unsubscribe — через /account → toggle back to 0.
ALTER TABLE users ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0
  CHECK(marketing_opt_in IN (0, 1));

-- ============================================================
-- updated_at auto-touch triggers
-- ============================================================
-- Стандартный паттерн: при UPDATE автоматически обновляем updated_at.
-- Не требует от app-кода вручную выставлять — меньше ошибок.
CREATE TRIGGER trg_slots_updated_at
  AFTER UPDATE ON slots
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE slots SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER trg_cohorts_updated_at
  AFTER UPDATE ON cohorts
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE cohorts SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER trg_applications_updated_at
  AFTER UPDATE ON applications
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE applications SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- ============================================================
-- Notes
-- ============================================================
--
-- 1. Counter-поля cohorts.apply_count / paid_count поддерживаются app-кодом
--    в src/lib/server/applications.ts, а не триггерами. Причина: status
--    transitions сложные (например paid → refunded должен decrement paid_count
--    но NOT apply_count). Триггер на каждый transition вышел бы громоздким;
--    helper-функции с явной транзакцией читаются проще.
--
-- 2. audit_log событий (FLOW-24) — пишутся app-кодом через logAuth():
--    apply_submitted, offer_accepted, application_status_changed,
--    application_cancelled, application_transferred, refund_processed.
--    Триггеры не использованы по той же причине что #1 + actor (user/admin/system)
--    не доступен из SQL контекста.
--
-- 3. Соотношение applications ↔ enrollments:
--    - При status='awaiting_payment' → enrollment_id IS NULL
--    - При webhook checkout.session.completed → создаём enrollment row +
--      UPDATE applications.enrollment_id + status='paid'
--    - При refund/cancel → enrollment.status='cancelled', application
--      получает соответствующий terminal status
--
-- 4. cohorts.start_date — UNIX seconds в UTC midnight. Display в ET делается
--    на UI-стороне через Intl.DateTimeFormat с timeZone='America/New_York'.
--    time_et у slot хранит "час дня по ET" отдельно от даты.
--
-- 5. publishUpcomingCohorts (Sprint 1 — manual run; Sprint 2 — daily cron):
--    Для каждого active slot создаёт cohorts на 12 мес вперёд если
--    ещё не существуют. Idempotent. Cohort = (slot_id, start_date) unique pair
--    (на app-уровне).
