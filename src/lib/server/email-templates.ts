/*
 * Email templates — i18n + HTML/text layouts для transactional писем.
 *
 * Архитектура (порт из ~/git/301/src/api/lib/messaging/, адаптирован
 * под moirai-бренд и нашу 2-locale модель):
 *   - плоская i18n map ключей `{lang}:{kind}:{slot}`
 *   - `getEmailTemplate(kind, lang, vars)` → { subject, text, html }
 *   - HTML: table-based responsive layout (Gmail/Outlook compatible),
 *     inline-styles only, system font stack (web fonts в emails флакают)
 *
 * Branding:
 *   - heading в "display"-стиле (system serif fallback — без webfonts)
 *   - amber accent (#D4820A) для кнопки и links
 *   - ink (#0D0B09) текст на paper (#F7F3EC) фоне
 *   - logo: текст "Moirai." крупно (SVG-лого пока нет — добавим
 *     отдельно когда дизайн утвердят)
 */

import type { Locale } from "../../../db/types";

export type EmailKind = "verify" | "password_reset" | "apply_welcome" | "payment_confirmation" | "magic_link";

const messages: Record<string, string | undefined> = {
  // === VERIFY (новая регистрация) ===
  "en:verify:subject":   "Confirm your email — Moirai",
  "en:verify:heading":   "Confirm your email.",
  "en:verify:welcome":   "Welcome to Moirai.",
  "en:verify:body":      "Tap the button below to confirm your email and activate your account.",
  "en:verify:button":    "Confirm email",
  "en:verify:link_hint": "Or copy this link to your browser:",
  "en:verify:expires":   "This link is valid for 30 minutes.",
  "en:verify:ignore":    "If you didn't sign up for Moirai — ignore this email.",

  "ru:verify:subject":   "Подтвердите ваш email — Moirai",
  "ru:verify:heading":   "Подтвердите ваш email.",
  "ru:verify:welcome":   "Добро пожаловать в Moirai.",
  "ru:verify:body":      "Нажмите кнопку ниже, чтобы подтвердить email и активировать аккаунт.",
  "ru:verify:button":    "Подтвердить email",
  "ru:verify:link_hint": "Или скопируйте эту ссылку в браузер:",
  "ru:verify:expires":   "Ссылка действительна 30 минут.",
  "ru:verify:ignore":    "Если вы не регистрировались в Moirai — проигнорируйте это письмо.",

  // === PASSWORD RESET ===
  "en:password_reset:subject":   "Reset your password — Moirai",
  "en:password_reset:heading":   "Reset your password.",
  "en:password_reset:welcome":   "",
  "en:password_reset:body":      "A password reset was requested for your Moirai account. Tap the button below to set a new password.",
  "en:password_reset:button":    "Reset password",
  "en:password_reset:link_hint": "Or copy this link to your browser:",
  "en:password_reset:expires":   "This link is valid for 15 minutes.",
  "en:password_reset:ignore":    "After password change, all active sessions are revoked — you'll need to sign in again on all devices. If you didn't request this — ignore this email.",

  "ru:password_reset:subject":   "Сброс пароля — Moirai",
  "ru:password_reset:heading":   "Сбросьте пароль.",
  "ru:password_reset:welcome":   "",
  "ru:password_reset:body":      "Поступил запрос на сброс пароля для вашего аккаунта Moirai. Нажмите кнопку ниже, чтобы задать новый пароль.",
  "ru:password_reset:button":    "Сбросить пароль",
  "ru:password_reset:link_hint": "Или скопируйте эту ссылку в браузер:",
  "ru:password_reset:expires":   "Ссылка действительна 15 минут.",
  "ru:password_reset:ignore":    "После смены пароля все активные сессии будут закрыты — потребуется заново войти на всех устройствах. Если вы не запрашивали сброс — проигнорируйте это письмо.",

  // === APPLY WELCOME (после Apply submit, Stage 14) ===
  "en:apply_welcome:subject":   "Welcome to Moirai — your cohort is reserved",
  "en:apply_welcome:heading":   "Your cohort is reserved.",
  "en:apply_welcome:welcome":   "Thanks for applying.",
  "en:apply_welcome:body":      "Your spot is reserved. Open your dashboard to see programme details, schedule, and the next step — payment is a separate action you can take when you're ready.",
  "en:apply_welcome:button":    "Open dashboard",
  "en:apply_welcome:link_hint": "Or copy this link to your browser:",
  "en:apply_welcome:expires":   "If you sign out and forget your password, visit moiraionline.pro/login, type your email and request a sign-in link — we'll email a fresh one each time.",
  "en:apply_welcome:ignore":    "If you didn't apply for a cohort — let us know at hello@moiraionline.pro.",

  "ru:apply_welcome:subject":   "Добро пожаловать в Moirai — место в когорте забронировано",
  "ru:apply_welcome:heading":   "Место в когорте забронировано.",
  "ru:apply_welcome:welcome":   "Спасибо за заявку.",
  "ru:apply_welcome:body":      "Ваше место зарезервировано. Откройте кабинет, чтобы посмотреть детали программы, расписание и следующий шаг — оплата отдельным действием, когда будете готовы.",
  "ru:apply_welcome:button":    "Открыть кабинет",
  "ru:apply_welcome:link_hint": "Или скопируйте эту ссылку в браузер:",
  "ru:apply_welcome:expires":   "Если выйдете и забудете пароль — зайдите на moiraionline.pro/login, введите email и запросите ссылку для входа. Мы пришлём свежую при каждом запросе.",
  "ru:apply_welcome:ignore":    "Если вы не подавали заявку — напишите нам на hello@moiraionline.pro.",

  // === PAYMENT CONFIRMATION (после webhook checkout_completed, Stage 14m) ===
  "en:payment_confirmation:subject":   "Payment confirmed — see you at the start",
  "en:payment_confirmation:heading":   "Payment confirmed.",
  "en:payment_confirmation:welcome":   "Your enrollment is complete.",
  "en:payment_confirmation:body":      "Your spot is locked in. You'll get access to course materials when the cohort starts. Open your dashboard to see the schedule and what's coming.",
  "en:payment_confirmation:button":    "Open dashboard",
  "en:payment_confirmation:link_hint": "Or copy this link to your browser:",
  "en:payment_confirmation:expires":   "Keep this email for your records — it's your receipt.",
  "en:payment_confirmation:ignore":    "Questions about the schedule or materials? Reply to this email or write to hello@moiraionline.pro.",

  "ru:payment_confirmation:subject":   "Оплата подтверждена — увидимся на старте",
  "ru:payment_confirmation:heading":   "Оплата подтверждена.",
  "ru:payment_confirmation:welcome":   "Запись завершена.",
  "ru:payment_confirmation:body":      "Ваше место зарезервировано. Доступ к материалам откроется к старту когорты. Откройте кабинет, чтобы увидеть расписание и что вас ждёт.",
  "ru:payment_confirmation:button":    "Открыть кабинет",
  "ru:payment_confirmation:link_hint": "Или скопируйте эту ссылку в браузер:",
  "ru:payment_confirmation:expires":   "Сохраните это письмо — это ваш чек.",
  "ru:payment_confirmation:ignore":    "Вопросы по расписанию или материалам? Ответьте на это письмо или напишите на hello@moiraionline.pro.",

  // === MAGIC LINK (sign-in без пароля, FLOW-19 / Stage 14o) ===
  "en:magic_link:subject":   "Your sign-in link — Moirai",
  "en:magic_link:heading":   "Sign in to Moirai.",
  "en:magic_link:welcome":   "",
  "en:magic_link:body":      "Tap the button below to sign in. You don't need a password.",
  "en:magic_link:button":    "Sign in",
  "en:magic_link:link_hint": "Or copy this link to your browser:",
  "en:magic_link:expires":   "This link is valid for 30 minutes and works once.",
  "en:magic_link:ignore":    "If you didn't ask for a sign-in link, ignore this email. No action is needed — the link can't sign you out of an active session.",

  "ru:magic_link:subject":   "Ссылка для входа — Moirai",
  "ru:magic_link:heading":   "Войти в Moirai.",
  "ru:magic_link:welcome":   "",
  "ru:magic_link:body":      "Нажмите кнопку ниже, чтобы войти. Пароль не нужен.",
  "ru:magic_link:button":    "Войти",
  "ru:magic_link:link_hint": "Или скопируйте эту ссылку в браузер:",
  "ru:magic_link:expires":   "Ссылка действительна 30 минут и работает один раз.",
  "ru:magic_link:ignore":    "Если вы не запрашивали ссылку — проигнорируйте это письмо. Действий не требуется — ссылка не выкидывает из активной сессии.",

  // === COMMON ===
  "en:common:footer":  "Moirai — Online Filmmaking Program",
  "en:common:website": "moiraionline.pro",
  "ru:common:footer":  "Moirai — Онлайн-программа кинорежиссуры",
  "ru:common:website": "moiraionline.pro",
};

function t(key: string, locale: Locale): string {
  return messages[`${locale}:${key}`] ?? messages[`en:${key}`] ?? `[${key}]`;
}

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateInput {
  kind: EmailKind;
  locale: Locale;
  actionUrl: string;
  recipientName?: string | null;
}

export function getEmailTemplate(input: TemplateInput): EmailTemplate {
  const { kind, locale, actionUrl, recipientName } = input;

  const subject = t(`${kind}:subject`, locale);
  const heading = t(`${kind}:heading`, locale);
  const welcome = t(`${kind}:welcome`, locale);
  const body = t(`${kind}:body`, locale);
  const button = t(`${kind}:button`, locale);
  const linkHint = t(`${kind}:link_hint`, locale);
  const expires = t(`${kind}:expires`, locale);
  const ignore = t(`${kind}:ignore`, locale);
  const footer = t("common:footer", locale);
  const website = t("common:website", locale);

  const greeting = recipientName
    ? locale === "ru"
      ? `Привет, ${recipientName}!`
      : `Hi ${recipientName},`
    : locale === "ru"
      ? "Привет!"
      : "Hi,";

  const lines = [
    heading,
    "",
    greeting,
  ];
  if (welcome) lines.push(welcome);
  lines.push(body, "", actionUrl, "", expires, ignore, "", `— ${footer}`, `https://${website}`);
  const text = lines.join("\n");

  const html = buildHTML({
    heading,
    greeting,
    welcome,
    body,
    button,
    actionUrl,
    linkHint,
    expires,
    ignore,
    footer,
    website,
  });

  return { subject, text, html };
}

interface HTMLParams {
  heading: string;
  greeting: string;
  welcome: string;
  body: string;
  button: string;
  actionUrl: string;
  linkHint: string;
  expires: string;
  ignore: string;
  footer: string;
  website: string;
}

/*
 * Inline-styled, table-based layout — Gmail/Outlook safe.
 * Палитра — наши design tokens (см. src/styles/tokens.css):
 *   #0D0B09 ink, #F7F3EC paper, #1A1612 elevated, #D4820A amber,
 *   #7A7168 muted, rgba(247,243,236,0.16) border-strong
 */
function buildHTML(p: HTMLParams): string {
  const welcomeLine = p.welcome
    ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#0D0B09;">${escapeHtml(p.welcome)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(p.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:Georgia,'Times New Roman',serif;color:#0D0B09;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EC;padding:48px 16px;">
    <tr>
      <td align="center">
        <!-- card -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid rgba(13,11,9,0.08);max-width:560px;width:100%;">
          <!-- logo -->
          <tr>
            <td align="center" style="padding:40px 40px 24px;">
              <a href="https://${escapeHtml(p.website)}" style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:300;color:#0D0B09;text-decoration:none;letter-spacing:0.02em;">Moirai.</a>
            </td>
          </tr>

          <!-- heading -->
          <tr>
            <td style="padding:0 40px 8px;">
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:300;font-size:28px;line-height:1.2;color:#0D0B09;letter-spacing:-0.01em;">${escapeHtml(p.heading)}</h1>
            </td>
          </tr>

          <!-- greeting -->
          <tr>
            <td style="padding:24px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1A1612;">
              <p style="margin:0 0 16px;">${escapeHtml(p.greeting)}</p>
              ${welcomeLine}
              <p style="margin:0 0 24px;">${escapeHtml(p.body)}</p>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td align="center" style="padding:8px 40px 32px;">
              <a href="${escapeAttr(p.actionUrl)}" style="display:inline-block;padding:16px 32px;background:#D4820A;color:#0D0B09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;">${escapeHtml(p.button)}</a>
            </td>
          </tr>

          <!-- fallback link -->
          <tr>
            <td style="padding:0 40px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.5;color:#7A7168;">
              <p style="margin:0 0 8px;">${escapeHtml(p.linkHint)}</p>
              <p style="margin:0;word-break:break-all;">
                <a href="${escapeAttr(p.actionUrl)}" style="color:#D4820A;text-decoration:none;">${escapeHtml(p.actionUrl)}</a>
              </p>
            </td>
          </tr>

          <!-- expires + ignore -->
          <tr>
            <td style="padding:0 40px 40px;border-top:1px solid rgba(13,11,9,0.08);">
              <p style="margin:24px 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.6;color:#7A7168;">${escapeHtml(p.expires)}</p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.6;color:#7A7168;">${escapeHtml(p.ignore)}</p>
            </td>
          </tr>
        </table>

        <!-- brand footer -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;margin-top:24px;">
          <tr>
            <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:1.6;color:#7A7168;">
              <p style="margin:0 0 4px;">${escapeHtml(p.footer)}</p>
              <p style="margin:0;">
                <a href="https://${escapeHtml(p.website)}" style="color:#7A7168;text-decoration:none;">${escapeHtml(p.website)}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  // URL атрибут: only & and " достаточно
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
