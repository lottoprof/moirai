/*
 * src/lib/config/lk.ts
 *
 * Centralized config для Student LK + Instructor LK.
 *
 * Все timing / limits / thresholds — здесь. Изменения = code change → deploy.
 * Per-cohort параметры (cadence, session days, time_et) — в `cohort_slots`.
 * Secrets — в wrangler secrets (Resend API key, R2 keys).
 *
 * Spec: docs/student-lk-v2-spec.md § 7.
 */

export const LK_CONFIG = {
  // --- Unlock / completion ---
  /** Module открывается за N часов до session.scheduled_at. */
  unlock_lead_hours: 6,
  /** Теоретический модуль (has_homework=0) → done через N часов после
   *  session.scheduled_at (lazy via getModuleCompletion query). */
  theory_auto_done_delay_hours: 1,

  // --- Homework upload (Stage C) ---
  homework_upload_cap_bytes: 100 * 1024 * 1024,    // 100 MB
  /** Amber badge "Срок завтра" / "Deadline tomorrow". */
  homework_deadline_warning_hours: 24,
  /** Pre-signed PUT URL TTL (для R2 upload). */
  signed_url_expiration_hours: 24,
  /** R2 GET URL TTL для playback/download. */
  signed_get_url_ttl_seconds: 3600,

  // --- Homework review ---
  student_comment_max_chars: 2000,
  instructor_comment_max_chars: 10000,

  // --- Retention (Stage F) ---
  retention_grace_days: 30,
  pre_archive_email_days_before: 7,
  /** 'immediate' | 'on_completion' — см. spec § 7 + Q10.A review. */
  gdpr_delete_mode: 'on_completion' as const,

  // --- UI (Stage E) ---
  drawer_width_px: 320,
  drawer_edge_swipe_zone_px: 20,
  /** Когда "Join meeting" button становится active (минут до session.scheduled_at). */
  zoom_join_window_minutes_before: 15,

  // --- Cron (Stage F) ---
  cron_batch_size: 50,
  orphan_cleanup_max_objects_per_run: 1000,

  // --- Instructor conflict policy (decisions_archive 2026-06-11 Q6) ---
  /** Минимальный gap между live-sessions одного instructor'а
   *  (как lead, так и substitute). Hard rule — UI блокирует
   *  cohort assignment / substitute / reschedule при нарушении. */
  min_instructor_rest_min: 30,
  /** Дефолтная длительность live-session для расчёта conflict
   *  window. Per-module override — TBD (Sprint 2). */
  default_session_duration_min: 60,
} as const;

export type LkConfig = typeof LK_CONFIG;
