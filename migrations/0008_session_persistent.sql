-- 0008_session_persistent.sql
-- Stage 23: добавляем persistent flag в auth_sessions для разных TTL
-- режимов refresh cookie:
--   persistent = 0 → default (1 день), обычный логин без "remember me"
--   persistent = 1 → remember (7 дней), либо через чекбокс на login,
--                    либо OAuth (Google/Discord — нет UI для чекбокса)
--
-- Нужно при refresh-rotation чтобы выбрать правильный TTL для нового
-- Set-Cookie (см. src/lib/server/session.ts).

ALTER TABLE auth_sessions ADD COLUMN persistent INTEGER NOT NULL DEFAULT 0;
