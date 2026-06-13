/*
 * GET /api/modules/[slug]/images/[file]
 *
 * Отдаёт картинку модуля из приватного R2 bucket `moirai-content` через
 * Worker binding. Auth — любой аутентифицированный юзер (admin /
 * instructor / student). Гранулярный gate (только enrolled student'ы)
 * не нужен — картинки сами по себе (композиционные схемы, кулешовские
 * шкалы) не commercially-sensitive, секретит сам workbook доступ через
 * page-level guards.
 *
 * R2 key pattern: `modules/{slug}/images/{file}`. file может содержать
 * расширение.
 *
 * Cache: 30 дней (immutable assets — изменение картинки → переименовать
 * файл или wait cache expiry).
 */

import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../../lib/server/guards';

export const prerender = false;

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

function inferContentType(file: string): string {
  const ext = file.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'png':  return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif':  return 'image/gif';
    case 'svg':  return 'image/svg+xml';
    default:     return 'application/octet-stream';
  }
}

export const GET: APIRoute = async (ctx) => {
  const userOrRes = await requireAuth(ctx, { allowDeactivated: false });
  if (userOrRes instanceof Response) return userOrRes;

  const { slug, file } = ctx.params;
  if (!slug || !file || typeof slug !== 'string' || typeof file !== 'string') {
    return notFound();
  }
  // Anti path-traversal — slug + file должны быть простыми.
  if (slug.includes('/') || slug.includes('..') || file.includes('/') || file.includes('..')) {
    return notFound();
  }

  const env = ctx.locals.runtime.env;
  const key = `modules/${slug}/images/${file}`;
  const obj = await env.MODULE_CONTENT.get(key);
  if (!obj) return notFound();

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType ?? inferContentType(file));
  headers.set('Cache-Control', 'private, max-age=2592000'); // 30 days, private (auth-gated)
  if (obj.size > 0) headers.set('Content-Length', String(obj.size));
  if (obj.etag) headers.set('ETag', `"${obj.etag}"`);

  return new Response(obj.body, { status: 200, headers });
};
