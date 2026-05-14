/*
 * Audit log writes для всех auth-событий.
 *
 * Compliance + forensic — каждое auth-событие (register, login,
 * logout, oauth_link, password_set, email_verify, password_reset,
 * login_failed, session_revoked, method_unlink) пишется в audit_log.
 *
 * Failures audit'a НЕ блокируют флоу — иначе временный D1 hiccup
 * убъёт login для всех пользователей. Логируем в console.error
 * для observability.
 *
 * PII safety: IP всегда хэшируется через IP_HASH_SALT. Plaintext IP
 * не попадает в БД и не должно появляться в metadata.
 */

import { extractRequestInfo, hashIp } from "./hash";

export type AuditEvent =
  | "register"
  | "login"
  | "logout"
  | "oauth_link"
  | "password_set"
  | "email_verify"
  | "password_reset"
  | "login_failed"
  | "session_revoked"
  | "method_unlink";

export type AuditMethod = "password" | "google" | "discord" | null;

/**
 * Записать событие в audit_log.
 *
 * @param userId — null если событие до известного user (например,
 *                 login_failed для несуществующего email)
 * @param metadata — JSON-encoded детали. PII не клади (IP уже хэширован).
 */
export async function logAuth(
  env: Cloudflare.Env,
  event: AuditEvent,
  userId: string | null,
  method: AuditMethod,
  request: Request,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { ip, ua } = extractRequestInfo(request);
  let ipHash: string;
  try {
    ipHash = await hashIp(ip, env.IP_HASH_SALT);
  } catch (err) {
    console.error("[audit] hashIp failed:", err);
    return;
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const metaJson = metadata ? JSON.stringify(metadata) : null;

  try {
    await env.DB.prepare(
      `INSERT INTO audit_log
         (id, user_id, event, method, ip_hash, user_agent, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, userId, event, method, ipHash, ua, metaJson, now)
      .run();
  } catch (err) {
    console.error(`[audit] insert failed (event=${event}):`, err);
  }
}
