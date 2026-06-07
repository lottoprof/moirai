/*
 * src/lib/server/r2-signed.ts
 *
 * Pre-signed URL generation для R2 (S3-compatible API) через aws4fetch.
 *
 * Why pre-signed:
 *   Worker Free plan имеет 10ms CPU per request — proxy 100 MB файла
 *   через worker превысит. Pre-signed URL pattern: worker генерирует
 *   подписанный URL (быстро), client PUT/GET напрямую на R2.
 *
 * Spec: docs/student-lk-v2-spec.md § Q2a + § 4.2.
 *
 * Required env vars (через wrangler secrets или .dev.vars):
 *   R2_ACCESS_KEY_ID      — R2 API token access key
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_ACCOUNT_ID         — Cloudflare account ID (для endpoint URL)
 *   R2_HOMEWORK_BUCKET    — bucket name (e.g. 'moirai-homework')
 */

import { AwsClient } from 'aws4fetch';

interface SignedUrlConfig {
  accessKeyId: string;
  secretAccessKey: string;
  accountId: string;
  bucket: string;
}

function getConfig(env: Cloudflare.Env): SignedUrlConfig {
  const cfg = {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    accountId: env.R2_ACCOUNT_ID,
    bucket: env.R2_HOMEWORK_BUCKET,
  };
  for (const [k, v] of Object.entries(cfg)) {
    if (!v) throw new Error(`R2 signed URL: missing env var ${k}`);
  }
  return cfg as SignedUrlConfig;
}

/**
 * Generate pre-signed PUT URL для upload в R2.
 *
 * @param env
 * @param key            — R2 object key (e.g. 'homework/{eid}/{sid}.mp4')
 * @param contentType    — mime type
 * @param expiresInSec   — TTL signed URL (default 24 * 3600 = 24h)
 */
export async function generateUploadUrl(
  env: Cloudflare.Env,
  key: string,
  contentType: string,
  expiresInSec: number = 24 * 3600,
): Promise<{ url: string; expiresAt: number }> {
  const cfg = getConfig(env);
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${encodeURIComponent(key)}`;
  const url = new URL(endpoint);
  url.searchParams.set('X-Amz-Expires', String(expiresInSec));

  const signed = await client.sign(
    new Request(url.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    }),
    { aws: { signQuery: true } },
  );

  return {
    url: signed.url,
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSec,
  };
}

/**
 * Generate pre-signed GET URL для playback/download R2 объекта.
 *
 * @param env
 * @param key            — R2 object key
 * @param expiresInSec   — TTL (default 3600 = 1h)
 */
export async function generateGetUrl(
  env: Cloudflare.Env,
  key: string,
  expiresInSec: number = 3600,
): Promise<{ url: string; expiresAt: number }> {
  const cfg = getConfig(env);
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${encodeURIComponent(key)}`;
  const url = new URL(endpoint);
  url.searchParams.set('X-Amz-Expires', String(expiresInSec));

  const signed = await client.sign(
    new Request(url.toString(), { method: 'GET' }),
    { aws: { signQuery: true } },
  );

  return {
    url: signed.url,
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSec,
  };
}

/**
 * HEAD check object exists в R2 (через worker binding, не S3 API).
 *
 * Используется в finalize endpoint чтобы verify client PUT'нул файл
 * до создания D1 row.
 */
export async function objectExists(
  env: Cloudflare.Env,
  key: string,
): Promise<{ exists: boolean; size: number | null }> {
  const obj = await env.HOMEWORK_BUCKET.head(key);
  if (!obj) return { exists: false, size: null };
  return { exists: true, size: obj.size };
}
