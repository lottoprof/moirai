/*
 * Email sender — STUB.
 *
 * Outbound email требует transactional service (Resend / Postmark /
 * CF Email Workers / Mailgun) — решение отложено до отдельного
 * stage'a. До этого функция логирует payload в console; на проде
 * это видно через `wrangler pages deployment tail`.
 *
 * Когда выберем сервис — реализация заменяется здесь, остальная
 * архитектура (call sites в register / password reset) не меняется.
 *
 * Templates пока inline (en/ru). HTML-версии добавятся когда будет
 * выбран сервис — у каждого свой формат attachments/inline-images.
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

interface EmailTemplate {
  subject: string;
  body: string;
}

function buildTemplate(p: SendEmailParams): EmailTemplate {
  const greeting = p.recipientName
    ? p.locale === "ru" ? `Привет, ${p.recipientName}!` : `Hi ${p.recipientName},`
    : p.locale === "ru" ? "Привет!" : "Hi,";

  if (p.kind === "verify") {
    return p.locale === "ru"
      ? {
          subject: "Подтвердите вашу почту — Moirai",
          body:
            `${greeting}\n\n` +
            `Спасибо за регистрацию в Moirai. Подтвердите вашу почту по ссылке:\n\n` +
            `${p.actionUrl}\n\n` +
            `Ссылка действует 1 час. Если вы не регистрировались — просто проигнорируйте.\n\n` +
            `— Moirai`,
        }
      : {
          subject: "Verify your email — Moirai",
          body:
            `${greeting}\n\n` +
            `Thanks for signing up to Moirai. Confirm your email by following this link:\n\n` +
            `${p.actionUrl}\n\n` +
            `The link is valid for 1 hour. If you didn't sign up — ignore this email.\n\n` +
            `— Moirai`,
        };
  }
  // password_reset
  return p.locale === "ru"
    ? {
        subject: "Сброс пароля — Moirai",
        body:
          `${greeting}\n\n` +
          `Поступил запрос на сброс пароля. Если это были вы, перейдите по ссылке:\n\n` +
          `${p.actionUrl}\n\n` +
          `Ссылка действует 1 час. Если вы не запрашивали сброс — просто проигнорируйте.\n\n` +
          `— Moirai`,
      }
    : {
        subject: "Reset your password — Moirai",
        body:
          `${greeting}\n\n` +
          `A password reset was requested for your account. If this was you, click:\n\n` +
          `${p.actionUrl}\n\n` +
          `The link is valid for 1 hour. If you didn't request this — ignore this email.\n\n` +
          `— Moirai`,
      };
}

/**
 * Отправить email. STUB: пишет в console.log. Caller'у возвращает
 * void даже при ошибке (audit покрывает critical paths).
 *
 * Когда подключим Resend/etc. — здесь fetch на их API + check status.
 */
export async function sendEmail(
  env: Cloudflare.Env,
  params: SendEmailParams,
): Promise<void> {
  void env;     // зарезервировано для будущего env.RESEND_API_KEY и т.п.
  const tpl = buildTemplate(params);
  console.log(
    `[email/STUB] to=${params.to} kind=${params.kind} locale=${params.locale}\n` +
      `  subject: ${tpl.subject}\n` +
      `  url:     ${params.actionUrl}`,
  );
  await Promise.resolve();
}
