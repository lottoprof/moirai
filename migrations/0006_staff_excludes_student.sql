-- Migration: 0006_staff_excludes_student.sql
-- Date:      2026-05-17
-- Spec:      decisions_archive.md 2026-05-17 §multi-role (clarification)
-- Rollback:  (dev only) DROP TRIGGER staff_role_excludes_student;
--
-- Business rule: staff (admin/instructor) и student взаимоисключаются.
-- Staff = люди работающие в платформе. Student = клиенты которые
-- покупают курсы. Один user не может быть и тем и другим одновременно.
--
-- Decision: admin+instructor ОК (admin-преподаватель), но любая staff
-- role исключает student. См. user 2026-05-17.
--
-- Реализация: AFTER INSERT trigger на user_roles. Когда добавляется
-- admin или instructor — автоматически DELETE student у того же user'a.
--
-- Reverse direction (INSERT student когда user — staff): не запрещаем
-- на trigger-уровне. UI/код решает что показывать. Если admin хочет
-- стать student'ом — сначала снять staff-роли (через PATCH /roles).

PRAGMA foreign_keys = ON;

CREATE TRIGGER staff_role_excludes_student
  AFTER INSERT ON user_roles
  WHEN NEW.role IN ('admin', 'instructor')
BEGIN
  DELETE FROM user_roles
   WHERE user_id = NEW.user_id
     AND role = 'student';
END;

-- Backfill: исправить existing users где есть admin/instructor + student
DELETE FROM user_roles
 WHERE role = 'student'
   AND user_id IN (
     SELECT user_id FROM user_roles
      WHERE role IN ('admin', 'instructor')
   );
