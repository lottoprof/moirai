-- 0017 — Instructor LK v2 Q9 (daily digest opt-in)
--
-- Поле для opt-in/opt-out preподa на ежедневный email digest
-- (pending submissions + late + сегодняшние sessions).
--
-- Default 1 (включено) — все existing instructor'ы получат digest
-- автоматически, могут выключить через /account toggle.
--
-- Student'ам это поле тоже создаётся (NOT NULL constraint), но
-- digest cron job фильтрует по role = 'instructor' через user_roles.
--
-- Связано с notifications_email (0015): это разные каналы, digest
-- shared между role'ами не имеет смысла, opt-out здесь не выключает
-- feedback emails и наоборот.

ALTER TABLE users ADD COLUMN instructor_digest_opt_in INTEGER NOT NULL DEFAULT 1;
