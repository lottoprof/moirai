/*
 * GET /api/modules/preview/{slug}/{locale}/{kind}
 *
 * Stream R2 object для preview модуля admin'у или instructor'у
 * (без unlock check). Methodist uploads, admin + instructor видят всё.
 *
 * Params:
 *   slug   — module slug
 *   locale — en | ru
 *   kind   — body | presentation | workbook
 *
 * Auth: admin OR instructor.
 *
 * Anti-traversal: r2_key берётся из modules table по (slug, locale),
 * не из query param. Невозможно запросить произвольный R2 object.
 */

import type { APIRoute } from 'astro';
import { requireAnyRoleApi } from '../../../../../../lib/server/guards';

export const prerender = false;

const KIND_TO_COLUMN: Record<string, string> = {
  body: 'body_r2_key',
  presentation: 'presentation_r2_key',
  workbook: 'workbook_r2_key',
};

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async (ctx) => {
  const userOrRes = await requireAnyRoleApi(ctx, ['admin', 'instructor']);
  if (userOrRes instanceof Response) return userOrRes;

  const { slug, locale, kind } = ctx.params;
  if (typeof slug !== 'string' || typeof locale !== 'string' || typeof kind !== 'string') {
    return jsonError('missing_param', 400);
  }
  if (locale !== 'en' && locale !== 'ru') return jsonError('bad_locale', 400);
  const column = KIND_TO_COLUMN[kind];
  if (!column) return jsonError('bad_kind', 400);

  const env = ctx.locals.runtime.env;
  const row = await env.DB.prepare(
    `SELECT ${column} AS r2_key FROM modules WHERE slug = ? AND locale = ?`,
  ).bind(slug, locale).first<{ r2_key: string | null }>();
  if (!row?.r2_key) return jsonError('not_found', 404);

  const obj = await env.MODULE_CONTENT.get(row.r2_key);
  if (!obj) return jsonError('r2_missing', 404);

  const contentType = (() => {
    const lower = row.r2_key.toLowerCase();
    if (lower.endsWith('.md')) return 'text/markdown; charset=utf-8';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
    return 'application/octet-stream';
  })();

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
    },
  });
};
