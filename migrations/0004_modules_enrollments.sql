-- Migration: 0004_modules_enrollments.sql
-- Date:      2026-05-17
-- Spec:      docs/Architecture.md §5 (module/programme/enrollment model),
--            decisions_archive.md 2026-05-17
-- Rollback:  (dev only) DROP TABLE enrollment_modules;
--                       DROP TABLE enrollments;
--                       DROP TABLE modules;
--
-- Содержание:
--   1. modules        — каталог модулей (metadata; body живёт в R2)
--                       Sync source: external repo lottoprof/moirai-content
--   2. enrollments    — runtime instance user × programme_slug
--                       с snapshot price + features + lead_instructor
--   3. enrollment_modules — mutable list модулей в enrollment'е
--                       (instructor может add/remove постфактум)
--
-- Не входит (Sprint 2+): runs/cohorts, sessions, homework, feedback,
--                       payments, promo_codes, referrals, resources.

PRAGMA foreign_keys = ON;

-- ============================================================
-- modules — каталог
-- ============================================================
-- Источник правды: external repo (lottoprof/moirai-content или аналог).
-- Sync pipeline (Sprint 2): GH Actions push → POST /api/admin/modules/sync.
--
-- Содержит метаданные + R2-ключ для body. Тело модуля в R2:
--   modules/{slug}.{locale}.md
-- Видео: modules/{slug}/video.mp4
--
-- Lifecycle: draft → published → archived. DELETE — только cleanup
-- через admin когда usage=0 (никаких enrollment_modules не ссылается).
CREATE TABLE modules (
  slug                   TEXT NOT NULL,            -- 'visual-language'
  locale                 TEXT NOT NULL
                         CHECK(locale IN ('en','ru')),
  title                  TEXT NOT NULL,
  track                  TEXT,                     -- 'directing'|'editing'|'scriptwriting'|'producing'|'sound'
  status                 TEXT NOT NULL DEFAULT 'published'
                         CHECK(status IN ('draft','published','archived')),
  has_video              INTEGER NOT NULL DEFAULT 0,
  has_homework           INTEGER NOT NULL DEFAULT 0,
  has_text               INTEGER NOT NULL DEFAULT 1,
  default_duration_days  INTEGER NOT NULL DEFAULT 7,
  requires_modules_json  TEXT NOT NULL DEFAULT '[]',   -- '["directors-eye","story-structure"]'
  body_r2_key            TEXT NOT NULL,            -- 'modules/visual-language.en.md'
  video_r2_key           TEXT,                     -- 'modules/visual-language/video.mp4'
  -- sync metadata
  source_commit          TEXT,                     -- git SHA из external repo
  -- lifecycle timestamps
  created_at             INTEGER NOT NULL,
  published_at           INTEGER,                  -- first transition to 'published'
  archived_at            INTEGER,
  synced_at              INTEGER NOT NULL,
  PRIMARY KEY (slug, locale)
);

CREATE INDEX idx_modules_status_track ON modules(status, track);
CREATE INDEX idx_modules_status       ON modules(status);

-- ============================================================
-- enrollments — runtime instance
-- ============================================================
-- user_id × programme_slug + snapshot цены/фич + lead_instructor.
-- При создании: modules копируются из programme.default_modules + auto-resolve.
CREATE TABLE enrollments (
  id                    TEXT PRIMARY KEY,                              -- UUID
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  programme_slug        TEXT NOT NULL,                                 -- 'beginner'|'intermediate'|'individual' (CC)
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK(status IN ('active','completed','cancelled','refunded')),
  -- snapshot цены НА МОМЕНТ покупки — programme price может меняться,
  -- студент сохраняет то что заплатил
  price_paid_amount     INTEGER NOT NULL,                              -- центы
  price_paid_currency   TEXT NOT NULL DEFAULT 'USD',
  -- features snapshot — изменение programme.features не влияет
  features_json         TEXT NOT NULL,                                 -- '{"live_sessions":true,...}'
  -- lead instructor (single, NULL = unassigned)
  lead_instructor_id    TEXT REFERENCES users(id),
  enrolled_at           INTEGER NOT NULL,                              -- unix seconds
  completed_at          INTEGER,
  cancelled_at          INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX idx_enrollments_user        ON enrollments(user_id);
CREATE INDEX idx_enrollments_status      ON enrollments(status);
CREATE INDEX idx_enrollments_programme   ON enrollments(programme_slug);
CREATE INDEX idx_enrollments_lead        ON enrollments(lead_instructor_id)
  WHERE lead_instructor_id IS NOT NULL;

-- ============================================================
-- enrollment_modules — mutable список модулей в enrollment'е
-- ============================================================
-- Source of truth о том, что доступно студенту.
-- При покупке: копируется из programme.default_modules с auto-resolve requires_modules.
-- Мутации: instructor (если lead) / admin через /api/{instructor,admin}/enrollments/[id]/modules.
--
-- module_slug ссылается на modules.slug, но НЕ через FK (модули могут
-- быть archived/удалены методистами). Soft-validation в коде +
-- render fallback "Module no longer available".
CREATE TABLE enrollment_modules (
  enrollment_id  TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  module_slug    TEXT NOT NULL,
  order_idx      INTEGER NOT NULL,                                     -- порядок в UI студента
  added_by       TEXT NOT NULL REFERENCES users(id),                   -- кто INSERT (или ссылка на system-user для bulk-копий)
  added_at       INTEGER NOT NULL,
  PRIMARY KEY (enrollment_id, module_slug)
);

CREATE INDEX idx_enrol_modules_order ON enrollment_modules(enrollment_id, order_idx);

-- ============================================================
-- Notes
-- ============================================================
--
-- Не делаем FK enrollment_modules.module_slug → modules.slug потому что:
--   1. SQLite не поддерживает FK на composite key (modules PK = slug+locale,
--      enrollment_modules — slug only)
--   2. Module archive/deletion не должен каскадно ломать enrollments
--   3. Soft-validation в коде проще — render fallback + admin alert
--
-- Concurrency: оптимистическое блокирование через enrollments.updated_at —
-- Sprint 2 (при ≤5 instructors конфликты практически невозможны).
--
-- Bootstrap первого admin'a — отдельный one-off шаг после применения 0003,
-- описан в `.agent/skills/deploy/SKILL.md` § First-admin bootstrap.
