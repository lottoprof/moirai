/*
 * Email sender — Resend implementation.
 *
 * Архитектура (decisions_archive.md 2026-05-15):
 *   Domain `moiraionline.pro` верифицирован в Resend (SPF + DKIM + MX
 *   feedback). Sending — POST на api.resend.com с Bearer
 *   env.RESEND_API_KEY.
 *
 * Templates — отдельно в `email-templates.ts` (HTML + text per locale).
 * Этот модуль только sender + от какого from отправляет.
 *
 * From: `MoiraiOnline <noreply@moiraionline.pro>` — единый для transactional.
 * Mailbox не читается; в шаблоне просим не отвечать.
 *
 * Errors не блокируют caller (register/reset flow). Логируем в
 * console.error для observability через `wrangler pages deployment tail`.
 */

import { getEmailTemplate, type EmailKind } from "./email-templates";
import type { Locale } from "../../../db/types";

export type { EmailKind };

export interface SendEmailParams {
  to: string;
  locale: Locale;
  kind: EmailKind;
  /** Full URL клиенту по которой он подтвердит действие. */
  actionUrl: string;
  /** Name юзера для приветствия. Может быть null/empty. */
  recipientName?: string | null;
}

const FROM = "MoiraiOnline <noreply@moiraionline.pro>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

/**
 * Отправить email через Resend API. Возвращает void даже при ошибке —
 * флоу не должен зависеть от деливерабельности.
 */
export async function sendEmail(
  env: Cloudflare.Env,
  params: SendEmailParams,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error("[email] RESEND_API_KEY not configured — email skipped");
    return;
  }

  const tpl = getEmailTemplate({
    kind: params.kind,
    locale: params.locale,
    actionUrl: params.actionUrl,
    recipientName: params.recipientName,
  });

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [params.to],
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
      }),
    });
  } catch (err) {
    console.error("[email] resend fetch failed:", err);
    return;
  }

  if (!res.ok) {
    let body: ResendResponse | string;
    try {
      body = await res.json<ResendResponse>();
    } catch {
      body = await res.text();
    }
    console.error(
      `[email] resend status=${res.status.toString()} to=${params.to} kind=${params.kind} body=${JSON.stringify(body)}`,
    );
    return;
  }

  let data: ResendResponse;
  try {
    data = await res.json<ResendResponse>();
  } catch {
    console.warn("[email] resend response JSON parse failed (treated as success)");
    return;
  }

  console.log(`[email] sent kind=${params.kind} to=${params.to} resend_id=${data.id ?? "?"}`);
}
