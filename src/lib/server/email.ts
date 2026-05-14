/*
 * Email sender — Resend implementation.
 *
 * Архитектура (decisions_archive.md 2026-05-15):
 *   Domain `moiraionline.pro` верифицирован в Resend через DNS
 *   (SPF + DKIM + MX feedback). Sending выполняется POST'ом на
 *   api.resend.com с Bearer RESEND_API_KEY.
 *
 * From: `Moirai <noreply@moiraionline.pro>` — единый адрес для
 * transactional (verify + password reset). Mailbox не читается; в
 * шаблоне просим не отвечать.
 *
 * Errors не блокируют caller (register/reset flow): provider downtime
 * не должен валить регистрацию. Логируем в console.error для
 * observability через `wrangler pages deployment tail`. В будущем —
 * dead-letter retry через CF Queue, отдельный stage.
 *
 * Templates inline (en/ru) — HTML не пока, plain text. HTML-version
 * добавим когда подключим react-email или mjml.
 */

import type { Locale } from "../../../db/types";

export type EmailKind = "verify" | "password_reset";

export interface SendEmailParams {
  to: string;
  locale: Locale;
  kind: EmailKind;
  /** Full URL клиенту по которой он подтвердит действие. */
  actionUrl: string;
  /** Name юзера для приветствия. Может быть null/empty. */
  recipientName?: string | null;
}

const FROM = "Moirai <noreply@moiraionline.pro>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface EmailTemplate {
  subject: string;
  text: string;
}

function buildTemplate(p: SendEmailParams): EmailTemplate {
  const greeting = p.recipientName
    ? p.locale === "ru" ? `Привет, ${p.recipientName}!` : `Hi ${p.recipientName},`
    : p.locale === "ru" ? "Привет!" : "Hi,";

  if (p.kind === "verify") {
    return p.locale === "ru"
      ? {
          subject: "Подтвердите вашу почту — Moirai",
          text:
            `${greeting}\n\n` +
            `Спасибо за регистрацию в Moirai. Подтвердите вашу почту по ссылке:\n\n` +
            `${p.actionUrl}\n\n` +
            `Ссылка действует 1 час. Если вы не регистрировались — просто проигнорируйте это письмо.\n\n` +
            `— Moirai\n` +
            `https://moiraionline.pro`,
        }
      : {
          subject: "Verify your email — Moirai",
          text:
            `${greeting}\n\n` +
            `Thanks for signing up to Moirai. Confirm your email by following this link:\n\n` +
            `${p.actionUrl}\n\n` +
            `The link is valid for 1 hour. If you didn't sign up — ignore this email.\n\n` +
            `— Moirai\n` +
            `https://moiraionline.pro`,
        };
  }
  // password_reset
  return p.locale === "ru"
    ? {
        subject: "Сброс пароля — Moirai",
        text:
          `${greeting}\n\n` +
          `Поступил запрос на сброс пароля. Если это были вы, перейдите по ссылке:\n\n` +
          `${p.actionUrl}\n\n` +
          `Ссылка действует 1 час. Если вы не запрашивали сброс — просто проигнорируйте.\n\n` +
          `После смены пароля все активные сессии будут закрыты — потребуется снова войти на всех устройствах.\n\n` +
          `— Moirai\n` +
          `https://moiraionline.pro`,
      }
    : {
        subject: "Reset your password — Moirai",
        text:
          `${greeting}\n\n` +
          `A password reset was requested for your account. If this was you, click:\n\n` +
          `${p.actionUrl}\n\n` +
          `The link is valid for 1 hour. If you didn't request this — ignore this email.\n\n` +
          `After password change, all active sessions are revoked — you'll need to sign in again on all devices.\n\n` +
          `— Moirai\n` +
          `https://moiraionline.pro`,
      };
}

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

/**
 * Отправить email через Resend API.
 * Возвращает void даже при ошибке — флоу не должен зависеть от
 * деливерабельности (audit покрывает critical paths).
 */
export async function sendEmail(
  env: Cloudflare.Env,
  params: SendEmailParams,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error("[email] RESEND_API_KEY not configured — email skipped");
    return;
  }

  const tpl = buildTemplate(params);

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
      `[email] resend status ${res.status.toString()} to=${params.to} kind=${params.kind} body=${JSON.stringify(body)}`,
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
