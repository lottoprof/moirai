/*
 * GET /api/auth/oauth/discord/callback
 *
 * Завершение Discord OAuth flow (mirror google/callback.ts):
 *   1. Consume state из KV_OAUTH_STATE (CSRF + PKCE verifier)
 *   2. Exchange code → access_token (с PKCE verifier)
 *   3. Fetch user через /users/@me (Bearer access_token)
 *   4. linkOrCreateUser:
 *      - findOauthIdentity(discord, id) → login если уже linked
 *      - findUserByEmail → ADD discord method (multi-method)
 *      - else → createUser + linkAuthMethod(discord)
 *   5. createRefreshSession (auto-login)
 *   6. audit_log: oauth_link (если first link) + login
 *   7. 303 redirect на role-home (computeRedirectTarget)
 *
 * Edge cases:
 *   - ?error=access_denied (user cancelled) → /login?error=oauth_cancelled
 *   - state expired → /login?error=oauth_state_invalid
 *   - Discord не вернул email (user не подтвердил email на Discord) →
 *     /login?error=discord_no_email — uniq для Discord (Google всегда даёт email).
 */

import type { APIRoute } from "astro";
import { consumeOAuthState } from "../../../../../lib/server/oauth";
import {
  exchangeDiscordCode,
  fetchDiscordUser,
} from "../../../../../lib/server/oauth/discord";
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

  // Step 0: handle ?error=... от Discord
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    await logAuth(env, "login_failed", null, "discord", request, {
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

  // Step 1: consume state
  const stateData = await consumeOAuthState(env, "discord", state);
  if (!stateData) {
    await logAuth(env, "login_failed", null, "discord", request, {
      reason: "oauth_state_missing_or_expired",
    });
    return redirect("/en/login?error=oauth_state_invalid");
  }

  const locale = stateData.locale;
  const returnTo = stateData.return_to;

  // Step 2: exchange code → tokens
  let tokens;
  try {
    tokens = await exchangeDiscordCode(env, {
      code,
      codeVerifier: stateData.verifier,
      redirectUri: stateData.redirect_uri,
    });
  } catch (err) {
    console.error("[oauth/discord/callback] token exchange:", err);
    await logAuth(env, "login_failed", null, "discord", request, {
      reason: "oauth_token_exchange_failed",
    });
    return redirect(`/${locale}/login?error=oauth_failed`);
  }

  // Step 3: fetch user info через REST
  let userInfo;
  try {
    userInfo = await fetchDiscordUser(tokens.access_token);
  } catch (err) {
    console.error("[oauth/discord/callback] fetchDiscordUser:", err);
    await logAuth(env, "login_failed", null, "discord", request, {
      reason: "oauth_user_fetch_failed",
    });
    return redirect(`/${locale}/login?error=oauth_failed`);
  }

  // Discord может вернуть user без email (если user не подтвердил email
  // на Discord). Это уникальный edge — Google всегда даёт email.
  // Логин невозможен без email — не с чем линковать identity.
  if (!userInfo.email) {
    await logAuth(env, "login_failed", null, "discord", request, {
      reason: "discord_no_email",
      provider_user_id: userInfo.id,
    });
    return redirect(`/${locale}/login?error=discord_no_email`);
  }

  // Step 4: linkOrCreateUser
  const existingIdentity = await findOauthIdentity(env, "discord", userInfo.id);
  let userId: string;
  let isFirstLink = false;

  if (existingIdentity) {
    userId = existingIdentity.user_id;
    await touchAuthMethod(env, existingIdentity.id);
  } else {
    const existingUser = await findUserByEmail(env, userInfo.email);

    if (existingUser) {
      // Multi-method auto-link — требуем что Discord подтвердил email,
      // иначе attacker мог завести Discord-аккаунт с чужим email.
      if (!userInfo.verified) {
        await logAuth(env, "login_failed", existingUser.id, "discord", request, {
          reason: "oauth_email_unverified_on_existing_user",
        });
        return redirect(`/${locale}/login?error=oauth_email_unverified`);
      }
      try {
        await linkAuthMethod(env, {
          userId: existingUser.id,
          kind: "discord",
          providerUserId: userInfo.id,
          providerEmail: userInfo.email,
          providerEmailVerified: true,
        });
      } catch (err) {
        console.error("[oauth/discord/callback] linkAuthMethod race:", err);
      }
      userId = existingUser.id;
      isFirstLink = true;
    } else {
      if (!userInfo.verified) {
        await logAuth(env, "login_failed", null, "discord", request, {
          reason: "oauth_email_unverified_on_new_user",
        });
        return redirect(`/${locale}/login?error=oauth_email_unverified`);
      }
      // Имя: global_name приоритетно (display), fallback на username
      const displayName = userInfo.global_name?.trim() || userInfo.username;
      const newUser = await createUser(env, {
        email: userInfo.email,
        name: displayName,
        locale,
        emailVerified: true,
      });
      await linkAuthMethod(env, {
        userId: newUser.id,
        kind: "discord",
        providerUserId: userInfo.id,
        providerEmail: userInfo.email,
        providerEmailVerified: true,
      });
      userId = newUser.id;
      isFirstLink = true;
    }
  }

  // Step 5: refresh session
  const { sessionId, cookieHeader } = await createRefreshSession(env, userId, request, "oauth");

  // Step 6: audit
  if (isFirstLink) {
    const hadPassword = await findAuthMethod(env, userId, "password");
    await logAuth(env, "oauth_link", userId, "discord", request, {
      provider_user_id: userInfo.id,
      provider_email_verified: userInfo.verified,
      had_password_method: hadPassword !== null,
    });
  }
  await logAuth(env, "login", userId, "discord", request, {
    via: "oauth",
    session_id: sessionId,
  });

  // Step 7: role-aware destination
  const userWithRoles = await getUserWithRoles(env, userId);
  const target = userWithRoles
    ? computeRedirectTarget(userWithRoles, returnTo ?? null)
    : `/${locale}/dashboard/`;
  return redirect(target, cookieHeader);
};
