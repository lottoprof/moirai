/*
 * POST /api/account/locale
 *
 * Меняет user.locale в БД для залогиненного юзера. Используется
 * <LangSwitcher mode="zone" /> в admin/instructor/student шапках:
 *
 *   - /admin/* читает locale из user.locale (DB),
 *     поэтому для смены нужен апдейт.
 *   - /{en|ru}/instructor|dashboard|account имеют locale в URL,
 *     но кросс-зонные emails (digest, password-reset) и фолбэки
 *     полагаются на user.locale — держим в sync.
 *
 * Public <LangSwitcher mode="public" /> на /{en|ru}/ страницах
 * этот endpoint НЕ вызывает (только cookie `locale_pref` и redirect).
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '../../../lib/server/guards';

export const prerender = false;

const BodySchema = z.object({ locale: z.enum(['en', 'ru']) });

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const userOrRes = await requireAuth(ctx, { allowDeactivated: true });
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;
  await env.DB.prepare(
    `UPDATE users SET locale = ? WHERE id = ?`,
  )
    .bind(parsed.data.locale, user.id)
    .run();

  return new Response(JSON.stringify({ ok: true, locale: parsed.data.locale }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
