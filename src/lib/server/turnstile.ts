/*
 * Cloudflare Turnstile siteverify — anti-bot первая линия на форму
 * login/register/reset.
 *
 * Client рендерит widget с TURNSTILE_SITE_KEY (public), пользователь
 * проходит challenge (часто invisible), widget кладёт response token
 * в hidden input `cf-turnstile-response`. Сервер берёт его, шлёт на
 * siteverify endpoint вместе с TURNSTILE_SECRET — если success=true,
 * проходим к rate-limit / valid handler.
 *
 * Docs: developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Проверить token. Возвращает true только если CF подтвердил.
 * При любой ошибке/таймауте/missing token — false (fail-closed).
 *
 * `remoteIp` опционален но желателен — CF использует для rate
 * limiting на своей стороне.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | null,
  env: Cloudflare.Env,
): Promise<boolean> {
  if (!token || token.length < 1) return false;
  if (!env.TURNSTILE_SECRET) {
    console.error("[turnstile] TURNSTILE_SECRET not configured");
    return false;
  }

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (remoteIp) form.append("remoteip", remoteIp);

  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    console.error("[turnstile] siteverify fetch failed:", err);
    return false;
  }

  if (!res.ok) {
    console.error(`[turnstile] siteverify status ${res.status.toString()}`);
    return false;
  }

  let data: SiteverifyResponse;
  try {
    data = await res.json<SiteverifyResponse>();
  } catch (err) {
    console.error("[turnstile] siteverify JSON parse:", err);
    return false;
  }

  if (!data.success) {
    console.warn("[turnstile] verification failed:", data["error-codes"]);
    return false;
  }
  return true;
}
