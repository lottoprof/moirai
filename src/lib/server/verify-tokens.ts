/*
 * One-time tokens в KV_VERIFY_TOKENS — для email verification и
 * password reset flows.
 *
 * Wire-формат: opaque base64url, 32 байта. Хранится в KV вместе с
 * payload (kind + userId + email + создание timestamp). TTL обычно
 * 1 ч (config через caller).
 *
 * Consume = GET + DELETE. Однократно — повторный consume возвращает null.
 */

import type { Locale } from "../../../db/types";

const KEY_PREFIX = "vt:";

export type VerifyTokenKind = "email_verify" | "password_reset";

export interface VerifyTokenPayload {
  kind: VerifyTokenKind;
  userId: string;
  email: string;
  locale: Locale;
  /** unix seconds */
  createdAt: number;
}

// Default TTL — fallback если caller не передал ttlSeconds.
// Конкретные значения per-kind:
//   email verify     — 30 мин (caller register.ts передаёт 1800)
//   password reset   — 15 мин (caller password-reset/request.ts передаёт 900)
const DEFAULT_TTL_SECONDS = 1800;     // 30 мин
const TOKEN_BYTES = 32;

export const TTL_VERIFY_EMAIL = 30 * 60;   // 30 мин
export const TTL_PASSWORD_RESET = 15 * 60; // 15 мин

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Создать новый one-time токен. Возвращает plaintext token —
 * передавай его в email link, в БД хранится через `vt:<token>` key.
 */
export async function createVerifyToken(
  env: Cloudflare.Env,
  payload: Omit<VerifyTokenPayload, "createdAt">,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const token = bytesToBase64Url(bytes);
  const full: VerifyTokenPayload = {
    ...payload,
    createdAt: Math.floor(Date.now() / 1000),
  };
  await env.KV_VERIFY_TOKENS.put(`${KEY_PREFIX}${token}`, JSON.stringify(full), {
    expirationTtl: ttlSeconds,
  });
  return token;
}

/**
 * Consume one-time token. GET + DELETE атомарно (best-effort — KV
 * eventually consistent, для нашей шкалы достаточно). Возвращает
 * payload или null.
 *
 * Опционально проверяет `expectedKind` — если payload.kind не
 * соответствует, отвергаем (не позволяем reset-токеном верифицировать
 * email и наоборот).
 */
export async function consumeVerifyToken(
  env: Cloudflare.Env,
  token: string,
  expectedKind?: VerifyTokenKind,
): Promise<VerifyTokenPayload | null> {
  const key = `${KEY_PREFIX}${token}`;
  const raw = await env.KV_VERIFY_TOKENS.get(key);
  if (!raw) return null;

  let payload: VerifyTokenPayload;
  try {
    payload = JSON.parse(raw) as VerifyTokenPayload;
  } catch {
    await env.KV_VERIFY_TOKENS.delete(key);
    return null;
  }

  if (expectedKind && payload.kind !== expectedKind) {
    // Не консьюмим — может быть валидный для другого endpoint'а
    return null;
  }

  await env.KV_VERIFY_TOKENS.delete(key);
  return payload;
}
