/*
 * GET /api/auth/oauth/google/callback
 *
 * Завершение OAuth flow:
 *   1. Consume state из KV_OAUTH_STATE (CSRF + PKCE verifier)
 *   2. Exchange code → tokens (с PKCE verifier)
 *   3. JWKS verify id_token + проверка iss/aud
 *   4. linkOrCreateUser:
 *      - findOauthIdentity(google, sub) — если уже linked → login
 *      - findUserByEmail — если есть password user → ADD google method
 *        (multi-method: user после этого имеет password + google)
 *      - else → createUser + linkAuthMethod(google)
 *   5. createRefreshSession (auto-login в этом браузере)
 *   6. audit_log: oauth_link (if first link) + login
 *   7. 303 redirect на return_to или /{locale}/dashboard
 *
 * Edge cases:
 *   - ?error=access_denied (user cancelled grant) → redirect на /login
 *     с ?error=oauth_cancelled
 *   - state expired / not found → redirect на /login с ?error=oauth_state_invalid
 *   - id_token verify fail → /login?error=oauth_token_invalid
 *   - email_verified=false от Google → /login?error=oauth_email_unverified
 *     (Google почти всегда возвращает true; false — edge case с
 *     migrated accounts или suspicious flagging)
 */

import type { APIRoute } from "astro";
import { consumeOAuthState } from "../../../../../lib/server/oauth";
import {
  exchangeGoogleCode,
  verifyGoogleIdToken,
} from "../../../../../lib/server/oauth/google";
import {
  findUserByEmail,
  findOauthIdentity,
  findAuthMethod,
  createUser,
  linkAuthMethod,
  touchAuthMethod,
} from "../../../../../lib/server/user-ops";
import { createRefreshSession } from "../../../../../lib/server/session";
import { logAuth } from "../../../../../lib/server/audit";
import { getUserWithRoles } from "../../../../../lib/server/guards";
import { computeRedirectTarget } from "../../../../../lib/server/auth-redirect";

export const prerender = false;

function redirect(location: string, cookieHeader?: string): Response {
  const headers: Record<string, string> = { Location: location };
  if (cookieHeader) headers["Set-Cookie"] = cookieHeader;
  return new Response(null, { status: 303, headers });
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = locals.runtime.env;

  // Step 0: handle ?error=... от Google (user cancelled etc.)
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    await logAuth(env, "login_failed", null, "google", request, {
      reason: "oauth_provider_error",
      provider_error: oauthError,
    });
    const safeError = encodeURIComponent(
      oauthError === "access_denied" ? "oauth_cancelled" : "oauth_failed",
    );
    return redirect(`/en/login?error=${safeError}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirect("/en/login?error=oauth_state_invalid");
  }

  // Step 1: consume state from KV (CSRF protection + extract PKCE verifier)
  const stateData = await consumeOAuthState(env, "google", state);
  if (!stateData) {
    await logAuth(env, "login_failed", null, "google", request, {
      reason: "oauth_state_missing_or_expired",
    });
    return redirect("/en/login?error=oauth_state_invalid");
  }

  const locale = stateData.locale;
  const returnTo = stateData.return_to;

  // Step 2: exchange code → tokens
  let tokens;
  try {
    tokens = await exchangeGoogleCode(env, {
      code,
      codeVerifier: stateData.verifier,
      redirectUri: stateData.redirect_uri,
    });
  } catch (err) {
    console.error("[oauth/google/callback] token exchange:", err);
    await logAuth(env, "login_failed", null, "google", request, {
      reason: "oauth_token_exchange_failed",
    });
    return redirect(`/${locale}/login?error=oauth_failed`);
  }

  // Step 3: JWKS verify id_token + extract user info
  let userInfo;
  try {
    userInfo = await verifyGoogleIdToken(env, tokens.id_token);
  } catch (err) {
    console.error("[oauth/google/callback] id_token verify:", err);
    await logAuth(env, "login_failed", null, "google", request, {
      reason: "oauth_id_token_invalid",
    });
    return redirect(`/${locale}/login?error=oauth_failed`);
  }

  // Step 4: linkOrCreateUser
  // Сначала: existing identity (kind=google, provider_user_id=sub) → login
  const existingIdentity = await findOauthIdentity(env, "google", userInfo.sub);
  let userId: string;
  let isFirstLink = false;

  if (existingIdentity) {
    // Уже linked — touch + login
    userId = existingIdentity.user_id;
    await touchAuthMethod(env, existingIdentity.id);
  } else {
    // Не linked: пробуем найти user по email
    const existingUser = await findUserByEmail(env, userInfo.email);

    if (existingUser) {
      // Multi-method auto-link: только если Google говорит email_verified=true.
      // Иначе attacker мог создать Google-account с чужим email → захват
      // existing user'a. Google почти всегда true; false → отказ.
      if (!userInfo.email_verified) {
        await logAuth(env, "login_failed", existingUser.id, "google", request, {
          reason: "oauth_email_unverified_on_existing_user",
        });
        return redirect(`/${locale}/login?error=oauth_email_unverified`);
      }
      try {
        await linkAuthMethod(env, {
          userId: existingUser.id,
          kind: "google",
          providerUserId: userInfo.sub,
          providerEmail: userInfo.email,
          providerEmailVerified: true,
        });
      } catch (err) {
        // Edge: race — кто-то залинковал параллельно. UNIQUE constraint.
        console.error("[oauth/google/callback] linkAuthMethod race:", err);
      }
      userId = existingUser.id;
      isFirstLink = true;
    } else {
      // New user — create + link
      if (!userInfo.email_verified) {
        // Edge: Google вернул unverified email для нового user. Скорее всего
        // что-то странное — отказываем для безопасности.
        await logAuth(env, "login_failed", null, "google", request, {
          reason: "oauth_email_unverified_on_new_user",
        });
        return redirect(`/${locale}/login?error=oauth_email_unverified`);
      }
      const newUser = await createUser(env, {
        email: userInfo.email,
        name: userInfo.name,
        locale,
        emailVerified: true,         // Google уже верифицировал email
      });
      await linkAuthMethod(env, {
        userId: newUser.id,
        kind: "google",
        providerUserId: userInfo.sub,
        providerEmail: userInfo.email,
        providerEmailVerified: true,
      });
      userId = newUser.id;
      isFirstLink = true;
    }
  }

  // Step 5: create refresh session (auto-login в текущем браузере).
  // mode="oauth" → 7 day TTL (нет UI для "remember me" чекбокса на redirect).
  const { sessionId, cookieHeader } = await createRefreshSession(env, userId, request, "oauth");

  // Step 6: audit events
  if (isFirstLink) {
    // Был ли password method у user'а — для контекста (multi-method linkage)
    const hadPassword = await findAuthMethod(env, userId, "password");
    await logAuth(env, "oauth_link", userId, "google", request, {
      provider_user_id: userInfo.sub,
      provider_email_verified: userInfo.email_verified,
      had_password_method: hadPassword !== null,
    });
  }
  await logAuth(env, "login", userId, "google", request, {
    via: "oauth",
    session_id: sessionId,
  });

  // Step 7: compute role-based target + redirect с Set-Cookie
  // computeRedirectTarget учитывает roles, deactivated_at, sanitize return_to.
  // См. decisions 2026-05-17 §18.
  const userWithRoles = await getUserWithRoles(env, userId);
  const target = userWithRoles
    ? await computeRedirectTarget(env, userWithRoles, returnTo ?? null)
    : `/${locale}/dashboard/`;
  return redirect(target, cookieHeader);
};
